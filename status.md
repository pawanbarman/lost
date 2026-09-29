# Cleanup Status — Lost & Found

Last updated: 2026-09-29 · Repo: `F:\lost` · Branch: `main` (uncommitted work in tree)

Plan of record: the 6-phase cleanup agreed on 2026-09-29. Phases 0, 1, 2a are **done and verified**.
Phases 2b, 3, 4, 5 remain. This file is the fast-orientation doc; `MIGRATION_COMPLETE_PLAN.md` is a
*historical* Render→Supabase migration record and is now outdated.

---

## 1. Current state

### Done & verified

**Phase 0 — Toolchain** ✅
- Deno **2.9.7** at `C:\Users\hp\.deno\bin\deno.exe`, registered on the Windows user PATH.
- Prisma **5.22.0** installed at repo root (`node_modules/.bin/prisma`).
- `npm install` run in both root and `client/`.
- `client/.env.local` created → points at the deployed edge function.
- Baseline confirmed: `deno test` → **13 passed (64 steps), 0 failed**.

**Phase 1 — Unbreak the dev loop** ✅
- `package.json` — `dev`/`build` point at `client/`; `dev:server` + `concurrently` removed;
  added `db:migrate` / `db:generate` / `db:studio`. Lockfile pruned.
- `client/vite.config.js` — dead `/api` + `/uploads` → `localhost:5000` proxy block removed.
- `client/src/utils/api.js:3` — `|| 'http://localhost:5000/api'` fallback removed. Now reads
  `VITE_API_URL` only, so a missing env var fails loudly instead of silently hitting a dead port.
- `client/index.html` — title "LeftBehind" → "Lost & Found".
- `client/.env.example` — new template.
- `client/.gitignore` — added `!.env.example` (its `.env*` rule was swallowing the template).
- Verified: client build 1447 modules OK · `npm run dev` boots in ~2.3s, HTTP 200 on :5173 ·
  CORS returns `Access-Control-Allow-Origin: http://localhost:5173`.

**Phase 2a — Decommission the Express twin** ✅
- Tag **`legacy-express-final`** → `dd016a2` (all 49 `server/` files recoverable from this tag).
- `prisma/schema.prisma:3` — removed `output = "../server/node_modules/.prisma/client"`.
  **This was load-bearing:** without it, `prisma generate` `mkdir -p`s a fresh `server/` back into
  existence, silently undoing the delete.
- `git rm -r server uploads` → **50 files deleted** (49 `server/` + `uploads/.gitkeep`).
- `.gitignore` — 6 `uploads/*` lines removed.
- Verified: `prisma generate` now writes to root `node_modules/@prisma/client`; **`ls server` does
  not exist** after generate; `deno test` still 13/64 green; client build still passes.

### Working tree — NOT COMMITTED
```
50 D   staged deletions (server/ + uploads/)
 9 M   .gitignore, client/.gitignore, client/index.html, client/package-lock.json,
       client/src/utils/api.js, client/vite.config.js, package-lock.json, package.json,
       prisma/schema.prisma
 1 ??  client/.env.example
```
Suggested: two commits — **Phase 0+1** (toolchain/dev loop) and **Phase 2a** (decommission).
`status.md` itself is gitignored, which is why it does not appear above.

---

## 2. Environment facts (these cost real time to discover)

| Fact | Detail |
|---|---|
| **Supabase project ref** | `cuhngnehtlswsdemsdpr` — **verified live**, `/api/health` returns HTTP 200 |
| **⚠️ Supabase MCP server is misconfigured** | It reports `mfthnsnoredjcqnkuzjw`, which hosts only an unrelated `bootstrap-admin` function and returns nothing on `/api/health`. **MCP SQL, `supabase secrets set`, and `supabase functions deploy` are all unusable.** Use the real CLI or the Supabase dashboard. The old docs' URL and the MCP tool disagreed — I curl'd both rather than trusting either. |
| **Never run `npx prisma`** | It tries to fetch `8.0.0-rc.17` and dies `ECOMPROMISED / Lock compromised`. Use `./node_modules/.bin/prisma`. |
| **`prisma validate` fails bare** | `P1012 Environment variable not found: DATABASE_URL`. Pre-existing, not a regression — there is no `.env` anywhere. Workaround for schema checks: `export DATABASE_URL="postgresql://user:pass@127.0.0.1:5432/postgres"`. |
| **Deno install script lies on this box** | `deno.land/install.ps1` printed "installed successfully" but left the dir **empty** — git-bash `tar` chokes on the `C:` path. Fixed via PowerShell `Expand-Archive`. Already done; only matters if reinstalling. |
| **git-bash + Deno** | `$USERPROFILE` is `C:\Users\hp`, which git-bash mangles in `PATH`. Invoke as `"$USERPROFILE/.deno/bin/deno.exe"` or use `/c/Users/hp/.deno/bin`. |
| Not installed | Docker, Supabase CLI. Present: WSL2 + `kali-linux` distro, virtualization enabled, 8 GB RAM. |
| Deploy flag | The edge function uses custom JWT, not Supabase Auth → **must** deploy with `--no-verify-jwt`. |

### Commands that work

```bash
# Tests (from supabase/functions/)
"$USERPROFILE/.deno/bin/deno.exe" test --allow-env --allow-net --allow-read --no-check

# Prisma (repo root)
DATABASE_URL="postgresql://user:pass@127.0.0.1:5432/postgres" ./node_modules/.bin/prisma validate
./node_modules/.bin/prisma generate

# Client
cd client && npm run build
npm run dev          # from repo root; serves :5173, talks to the deployed function
```

---

## 3. What is left

### Phase 2b — `Location` table drop · **BLOCKED on DB access**
The `model Location` (5 lines, `prisma/schema.prisma`) is referenced by **nothing** — every grep hit
for "Location" is `Item.currentLocation` or `Event.location`, both plain text columns. Never seeded.

Deliberately **not** done yet: removing the model without a migration would leave schema and database
permanently disagreeing, and `prisma migrate dev` cannot run against Supabase (no shadow database),
so the drop would never apply. Five harmless lines beat inherited drift.

To execute later:
1. Connection string → gitignored root `.env` as `DATABASE_URL` (direct, port 5432, `sslmode=require`).
2. Delete `model Location` from `prisma/schema.prisma`.
3. New folder `prisma/migrations/<timestamp>_drop_location_table/migration.sql` containing
   `DROP TABLE "Location";` — timestamp must sort after `20260924140000_rpc_default_ids`.
4. `./node_modules/.bin/prisma migrate deploy`.
5. Same session: the live DB reportedly has **2 orphaned `Item` rows** with no `Report` (from the
   2026-09-25 audit — unverified since the SQL tool is broken). Review the count, then delete.

### Phase 3 — Close the reset-token hole · **the one real security defect**
`supabase/functions/api/routers/auth.ts:129-134` returns a working 30-minute password-reset token
**directly in the JSON body**. Anyone who knows a registered email can take over that account.

- New `_shared/email.ts` — `sendPasswordReset(to, link)` via a provider REST API and plain `fetch`.
  **No SDK, no new dependency.**
- `auth.ts:108-135` — email the link; return the generic message on *every* path so account
  existence never leaks. `console.error` on send failure (visible in logs, leaks nothing).
- `client/src/pages/ForgotPassword.jsx` — delete the token-surfacing branch (lines 31-67).
- `client/src/pages/ResetPassword.jsx` — **no change needed**; already reads `?token=` (line 9).
- New env: `RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`.
- New test: `forgot-password` response must not contain `resetToken`, for a known *and* unknown email.
- **Also:** `supabase/functions/api/_shared/env.ts:13` is `nodeEnv: key("NA", "development")` — a
  typo for `NODE_ENV`. `nodeEnv` is referenced nowhere else, so **delete the line, don't repair it.**
- Keep `MAX_FILE_SIZE` (line 14) — it *is* read at `image.ts:25`.

**Blocked on:** an email provider account, and a working way to set edge-function secrets
(the MCP server is misconfigured, so this needs the real Supabase CLI or the dashboard).
Fallback if no provider: gate the endpoint to 503, which closes the hole without email.

### Phase 4 — Client route guards + 404
29 routes, **0 guarded**, no 404 route. 6 pages hand-roll `navigate('/login')` in a `useEffect`.
Not a security hole — the API 401s and the axios interceptor (`client/src/utils/api.js:22`)
hard-redirects — but users see a frame of private UI before bouncing, and bad URLs render blank.

- `client/src/App.jsx` — add `RequireAuth` / `RequireAdmin`; wrap ~20 authenticated + 5 `/admin/*`
  routes. Both must await `AuthContext.loading` or a page refresh flashes a redirect.
- Delete the 6 now-redundant ad-hoc `useEffect` redirects.
- New `client/src/pages/NotFound.jsx` + `<Route path="*" />`.
- `Login` / `Register` — redirect away if already authenticated (one `<Navigate>`).
- Verify: `/dashboard` logged out → `/login`; `/admin` as a normal user → blocked; `/nonsense` → 404;
  refresh on `/matches` does not flash.

### Phase 5 — Docs, deploy, verify
Docs go **last** so the README is written once against the final state.

- Rewrite `README.md` — it currently documents the retired Express/Prisma stack and lists env vars
  (`PORT`, `CLIENT_URL`, `UPLOAD_DIR`) the edge function never reads. `MAX_FILE_SIZE` *is* real.
  Must document the `--no-verify-jwt` deploy flag **and why**, real test/flow commands, and that
  local dev = deployed function.
- Delete `MIGRATION_COMPLETE_PLAN.md` (27 KB) + `DOCS_DEMO_CREDS.md` — both are completed-migration
  handoff notes. Git preserves them.
- Set edge secrets (`RESEND_API_KEY`, `MAIL_FROM`, `APP_URL`, `ALLOWED_ORIGINS`).
- Deploy: `supabase functions deploy api --no-verify-jwt`; Vercel redeploy of `client/`.
- Full verification: `deno check` · `deno test` (64 steps) · integration flow (86 checks) against the
  deployed function · `npm run build` · prod smoke: register → report lost → report found →
  auto-match → claim → handover → RETURNED.

---

## 4. Known minor rot (not worth a phase)

- **Dangling provenance comments.** Six comments now reference deleted files:
  `supabase/functions/api/_shared/cloudinary.ts:5` and `image.ts:7` ("Mirrors `server/src/...`"),
  plus three in `prisma/migrations/20260924130000_supabase_rpc_functions/migration.sql:3-5`.
  Harmless, but a reader grepping for them finds nothing — the code now lives at
  `legacy-express-final`. The `/uploads/a.jpg` strings in `tests/matchingEngine.test.ts:298,300` are
  just fixture values, not paths.
- `client/` has 4 npm audit advisories (3 moderate, 1 high). `npm audit fix --force` would force
  breaking changes — not worth it unprompted.

## 5. Deliberately skipped (revisit only on hitting the ceiling)

- Migrating auth to Supabase Auth — touches every route's middleware for no gain once real email exists.
- Docker / local Supabase stack — declined; 5 GB install and RAM pressure on an 8 GB box.
- Splitting the 707-line integration flow — it works.
- Realtime notifications — currently polling; no user-visible defect.

---

## 6. Fresh-session guide

Paste this at the start of a new session:

> Working on `F:\lost` (Lost & Found: React SPA + Supabase Edge Function in Deno/Oak + Postgres).
> **Read `F:\lost\status.md` first** — it has current state, environment gotchas, and remaining phases.
> Phases 0, 1, 2a are done and verified but **NOT committed**. Phase 2b is blocked on DB access.
> Do NOT use `npx prisma` — use `./node_modules/.bin/prisma`. The Supabase MCP server is pointed at
> the wrong project (`mfthnsnoredjcqnkuzjw`); the real ref is `cuhngnehtlswsdemsdpr`.

Then orient with:

```bash
cd /f/lost
git status --short          # expect 50 D, 9 M, 1 ?? (unless committed since)
git tag -l                  # legacy-express-final = rollback for the server/ delete
"$USERPROFILE/.deno/bin/deno.exe" --version
./node_modules/.bin/prisma --version
curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 \
  https://cuhngnehtlswsdemsdpr.supabase.co/functions/v1/api/health   # expect 200
```

**Before changing anything**, re-establish the safety net:
```bash
cd /f/lost/supabase/functions
"$USERPROFILE/.deno/bin/deno.exe" test --allow-env --allow-net --allow-read --no-check
# expect: ok | 13 passed (64 steps) | 0 failed
```

### Rollback for the Phase 2a delete
```bash
git reset --hard legacy-express-final   # restores server/ + uploads/ wholesale
# or recover one file:
git show legacy-express-final:server/src/app.js
```
