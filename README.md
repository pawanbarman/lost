# Lost&Found — Lost & Found Platform

> **Lost something? Found something? Lost&Found connects the right person with the right item while protecting ownership information.**

A full-stack Lost & Found platform with automated matching, ownership verification, admin moderation, event management, and a dark-themed UI.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, React Router 6, Tailwind CSS, Lucide, Axios |
| Backend | **Supabase Edge Function** (Deno 2 + [Oak](https://jsr.io/@oak/oak) 17) |
| Database | Supabase Postgres, accessed with `@supabase/supabase-js` (service role) |
| Auth | Custom HS256 JWT (`jose`), bcrypt (10 rounds) |
| Validation | Zod |
| Images | Cloudinary |
| Email | Any SMTP relay (Brevo in production), minimal built-in client |
| Tests | `deno test` + `@std/testing` |

> **The Express/Prisma server is gone.** An earlier version of this project ran Node + Express + Prisma
> on port 5000. It was replaced by a single Supabase Edge Function. If you are reading a doc that
> mentions `PORT`, `CLIENT_URL`, `UPLOAD_DIR`, `npx prisma migrate dev`, or `localhost:5000`, it is
> stale. `prisma/schema.prisma` remains only as a schema reference — **it is not the runtime ORM and
> `prisma migrate deploy` must not be used** (see [Migrations](#migrations)).

---

## Architecture

```
┌──────────────┐   HTTPS + JWT    ┌─────────────────────────┐   service role   ┌────────────┐
│  React SPA   │ ───────────────► │  Supabase Edge Function │ ───────────────► │  Postgres  │
│  Vercel      │   Bearer token   │  (Oak, Deno 2)          │   (BYPASSRLS)   │            │
│  :5173 local │                  │  routers/ + _shared/    │                  └────────────┘
└──────────────┘                  └───────────┬─────────────┘
                                              │ optional
                                              ▼
                                    ┌───────────────────┐
                                    │ Python DINOv2 ML  │
                                    │ service (FastAPI) │
                                    └───────────────────┘
```

**The browser never talks to the database.** It holds no Supabase key and never calls PostgREST;
every read and write goes through the Edge Function, which authenticates the JWT and then queries
using `SUPABASE_SERVICE_ROLE_KEY`. This is why the deny-all RLS posture in
[Migrations](#migrations) is safe — and why it must stay that way.

### Request pipeline

`errorHandler` → `applyCors` → `securityHeaders` → `rateLimit` → routers (`supabase/functions/api/index.ts`).

---

## Local development

There is **no local backend**. Docker is not installed, so `supabase functions serve` is unavailable.
The client talks to the deployed Edge Function directly.

```bash
# root — installs Prisma (schema reference only) and the client
npm install
cd client && npm install && cd ..

# client/.env.local
VITE_API_URL=https://<project-ref>.supabase.co/functions/v1/api
```

Then:

```bash
npm run dev     # → http://localhost:5173
npm run build   # → client/dist
```

⚠️ **`client/.env.local` must contain `VITE_API_URL`.** If it doesn't, `axios` gets
`baseURL: undefined` and issues *relative* requests — the SPA fallback then returns `index.html`
with a 200, which `AuthContext.verifyToken()` will happily store as the user object, leaving
`isAdmin` silently `undefined`. `VITE_API_URL` must also be set in the Vercel project environment;
a local build is not deployable on its own.

### Tests

```bash
cd supabase/functions/api

deno check index.ts routers/*.ts _shared/*.ts tests/*.ts
deno lint
deno test --allow-env --allow-net --allow-read tests/ --ignore=tests/mlImageWiring.test.ts
```

`tests/mlImageWiring.test.ts` is excluded from the command above because it is timing-sensitive and
flakes under load; run it alone when working on ML wiring.

End-to-end flows against a live function register throwaway users at runtime:

```bash
deno run --allow-env --allow-net tests/flows/integration.flow.ts
deno run --allow-env --allow-net tests/flows/image.flow.ts   # needs TEST_IMAGE
```

---

## Environment variables

Edge Function secrets (`supabase secrets set`):

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_URL` | auto | Injected by the platform |
| `SUPABASE_ANON_KEY` | auto | Injected by the platform |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | KEEP SECRET. Backend-to-DB admin client |
| `JWT_SECRET` | ✅ | HS256 secret for session **and** reset tokens |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated browser origins |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | ✅ for uploads | KEEP SECRET |
| `SMTP_HOST` | for email | e.g. `smtp-relay.brevo.com` |
| `SMTP_PORT` | for email | `587` = STARTTLS (default), `465` = implicit TLS |
| `SMTP_USER` / `SMTP_PASS` | optional | **Both or neither.** One alone disables email |
| `SMTP_SECURE` | for email | Inferred from port; `true` forces implicit TLS |
| `MAIL_FROM` | for email | Verified sender, e.g. `Lost & Found <no-reply@you.com>` |
| `APP_URL` | for email | Public origin; emailed link is `<APP_URL>/reset-password?token=…` |
| `LEFTBEHIND_ML_SERVICE_URL` | optional | Unset ⇒ ML disabled, metadata-only matching |
| `LEFTBEHIND_ML_TIMEOUT_MS` | optional | Default `5000` |
| `LEFTBEHIND_ML_MATCHING_DEADLINE_MS` | optional | Whole-run budget, default `5000` |

`.env.example` carries the full annotated list.

---

## Password reset

`POST /api/auth/forgot-password` emails a single-use link; `POST /api/auth/reset-password` exchanges
the token for a new password.

- The endpoint **fails closed**. If `SMTP_HOST`, `MAIL_FROM` or `APP_URL` is missing, or only one
  half of the credential pair is set, it returns **503** and issues no token. It never returns the
  token in the response body — the earlier implementation did, which handed an account-takeover
  primitive to anyone who could guess an email address.
- Reset tokens are HS256 JWTs with a `purpose` claim, TTL **30 minutes**. A session token cannot be
  replayed as a reset token, or vice versa.
- **No user enumeration.** Known and unknown addresses return byte-identical 200 responses.
  Delivery failures are caught and logged server-side rather than surfaced.
- SMTP is mandatory-upgraded: unless `SMTP_SECURE` is on, the client refuses to `AUTH` unless the
  server advertises `STARTTLS`. It also passes the hostname to `Deno.startTls` — without that,
  certificate verification fails against a real relay, because Deno would derive the TLS servername
  from the socket's peer IP.

---

## Matching

A weighted scorer over 12 evidence fields (`matching/featureExtractor.ts`):

| Field | Weight | | Field | Weight |
|-------|-----------|-|-------|-----------|
| Unique features | 0.18 | | Category | 0.12 |
| Model | 0.15 | | Image (ML) | 0.10 |
| Brand | 0.10 | | Title | 0.08 |
| Color | 0.08 | | Description | 0.06 |
| Size | 0.04 | | Location | 0.04 |
| Condition | 0.03 | | Time | 0.02 |

Thresholds (`matching/ruleBasedMatcher.ts`): `CONTRADICTION_FACTOR 0.5`,
`CONFIDENCE_THRESHOLDS {high: 0.7, medium: 0.4}`, `STRONG_MATCH 0.9`, `PARTIAL_MATCH 0.4`.
Fields are renormalised by the weight of the evidence actually available, so a sparse record is not
penalised for missing fields, and thin evidence is scaled down by `coverage`.

The optional Python service adds a `image_similarity` field and nothing more — see
[`ml-service/README.md`](ml-service/README.md). If it is absent or times out, `image_similarity`
becomes `null` and matching degrades to metadata-only. Every failure mode resolves to `null` rather
than throwing, so a broken ML service can never fail report creation.

---

## API

Base: `<function-url>` (both `/health` and `/api/health` respond).

| Group | Prefix | Endpoints |
|-------|--------|-----------|
| Auth | `/api/auth` | `POST /register`, `POST /login`, `GET /me`, `POST /forgot-password`, `POST /reset-password` |
| Reports | `/api/reports` | `POST /`, `GET /`, `GET /my`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `GET /:id/matches` |
| Search | `/api/search` | `GET /` — `q`, `type`, `category`, `location`, `startDate`, `endDate`, `status`, `sort` |
| Found feed | `/api/found-feed` | `GET /` — `page`, `limit`, `sort`, `communityId`, `q`, `category`, `color`, `brand`, `location`, `dateFrom`, `dateTo`, `status` |
| Matches | `/api/matches` | `GET /`, `GET /:id`, `PUT /:id/status` |
| Claims | `/api/claims` | `POST /`, `GET /`, `GET /:id`, `PUT /:id/status`, `PUT /:id/handover` |
| Notifications | `/api/notifications` | `GET /`, `GET /unread-count`, `PUT /:id/read`, `PUT /read-all` |
| Categories | `/api/categories` | `GET /`, `POST /`, `DELETE /:id` |
| Communities | `/api/communities` | `GET /`, `POST /` |
| Events | `/api/events` | `GET /`, `GET /:id`, `POST /`, `PUT /:id`, `DELETE /:id` |
| Admin | `/api/admin` | `GET /dashboard`, `GET /reports`, `GET /reports/flagged`, `PUT /reports/:id/status`, `PUT /reports/:id/flag`, `PUT /reports/:id/unflag`, `GET /users`, `PUT /users/:id/role`, `GET /audit-logs` |

---

## Database

10 tables: `User`, `Item`, `Report`, `Match`, `Claim`, `Notification`, `AuditLog`, `Category`,
`Community`, `Event`.

```
User ──┬── Report ── Item
       │      └── Match ── Match
       │      └── Claim
       ├── Notification
       └── AuditLog

Event, Community, Category ── referenced by Report
```

### Migrations

History lives in `supabase_migrations.schema_migrations`; files are in `supabase/migrations/`.

> **Use the Supabase CLI or MCP `supabase_apply_migration` — never `prisma migrate deploy`.**
> There is no `_prisma_migrations` table. Prisma would read an empty history and try to replay
> `prisma/migrations/` from scratch, which still contains `CREATE TABLE "Location"` for a table that
> no longer exists.

> ⚠️ **After applying a migration, run `supabase migration list` and rename the file to the version
> the server actually recorded.** `supabase_apply_migration` assigns its own version, which may
> differ from the timestamp you wrote in the filename. A mismatch makes the next `db push` re-run
> an already-applied migration.

**All 10 tables have RLS enabled with zero policies — deny-all, and it is intentional.** This is not
an oversight and must not be "fixed" with permissive policies: the browser holds no database
credentials, and `service_role` bypasses RLS, so the Edge Function is unaffected. Adding a policy
would re-open direct PostgREST access with the *publishable* key, which is public by design. That is
not hypothetical — RLS was found disabled on all 10 tables, which exposed every user's bcrypt
`passwordHash` and allowed inserting a `User` with `role='ADMIN'`. See `status.md` §3c.

---

## Security

- **Passwords** — bcrypt, 10 rounds
- **Sessions** — HS256 JWT, 7-day expiry
- **Reset tokens** — separate `purpose` claim, 30-minute TTL, single deliverable
- **RBAC** — admin routes re-checked server-side; the client-side `RequireAdmin` is UX, not security
- **Ownership** — users may only modify their own reports/matches/claims
- **Validation** — Zod schemas on all create/update endpoints
- **Uploads** — JPEG/PNG/WEBP, size-capped, Cloudinary-hosted
- **Rate limiting** — 100 requests / 15 min / IP (in-memory; per-worker, best-effort across workers)
- **Headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- **CORS** — explicit origin allow-list via `ALLOWED_ORIGINS`; unknown origins get no header
- **SQL injection** — the Supabase client parameterises; RPCs are used for atomic multi-row writes
- **CRLF injection** — SMTP envelope addresses reject embedded line breaks *before* parsing
- **Errors** — no stack traces in responses

`npm audit` currently reports 5 advisories (2 high, 3 moderate) in `client/`:

- **axios — high, and the only one worth acting on.** A batch of advisories affects
  `axios <= 1.19.0`, including prototype-pollution gadgets and redirect-based SSRF via
  `maxRedirects: 0` not being enforced. **A non-breaking fix exists**: `npm audit fix` moves
  `1.19.0 → 1.20.0` inside the already-declared `^1.6.2` range.
- **react-router 6 / esbuild — moderate, both dev-time or upgrade-gated.** Fixing them needs
  `npm audit fix --force`, which installs `react-router-dom@7` (major) and `vite@8` (major).
  Not worth it unprompted.

---

## Deployment

**Backend** — Supabase Edge Function `api`:

```bash
supabase functions deploy api
```

JWT verification is **disabled for this function** (`--no-verify-jwt`), because the app issues its
own JWTs with `JWT_SECRET` and the platform's gateway cannot verify them. This is safe only because
every private route re-validates the token in `_shared/jwt.ts`; do not add routes that assume the
gateway already checked it.

**Frontend** — Vercel, from `client/`. `client/vercel.json` rewrites all paths to `index.html` for
client-side routing. `VITE_API_URL` must be set in the project environment.

---

## Known limitations

- No WebSockets — notifications poll
- No push notifications
- No map-based location view
- No mobile app
- ML image matching is optional and not deployed
- Rate limiting is per-worker and in-memory, so it resets on cold start
- `client/.env.local` and `AuthContext` payload validation are open issues — see
  [Local development](#local-development)

## License

ISC