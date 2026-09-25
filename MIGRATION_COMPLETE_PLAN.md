# Migration Plan: Render/Vercel → Supabase + New Vercel Account

> Status: Phases 0–4 complete (2026-09-25) + **demo-credential & seed cleanup DONE** (2026-09-25): all seeded demo accounts/data deleted from the live Supabase DB, demo-credential hints stripped from the client (`Login.jsx`) + `README.md`, both seed files (`supabase/seed.sql`, `server/prisma/seed.js`) reduced to reference data, and the integration/image flows rewritten to register throwaway users at runtime (verified `deno check` green). Phase 2 (API port) verified end-to-end: integration flow **86/86 PASS** + unit tests **13 suites / 64 steps green**. Phase 3 (client image pre-compression) implemented + server upload path verified **10/10 PASS**; final in-browser check is a manual step. Phase 4 (deploy) DONE — backend live on Supabase Edge Function + frontend live on new Vercel project (see Phase 4 notes). **Phase 5 (cutover) NOT started — work paused.** **Phase 4 deploy re-verify DONE (2026-09-25)**: Edge Function `api` redeployed as **v4** (SHA `620f5065…`) with a real fix — `_shared/error.ts` now maps Oak `HttpError` (e.g. `BadRequestError`) to its HTTP status, so malformed JSON returns **400 instead of 500**; live checks on v4 passed: health 200, register 201 / login 200 round-trip, CORS from localhost + Vercel origin, and the full forgot → reset-password round-trip (see Phase 4 notes).
> Date: 2026-09-25

## History (last session)

- **Phase 0 — DONE (verified).** `supabase init` (project_id `lost`), `supabase/functions/deno.json` import map (Oak 17, supabase-js, jose, bcryptjs), `supabase/functions/api/` skeleton + all `_shared/` modules, `.env.example` updated.
  - Installed: Deno 2.9.7 (winget; **not on PATH — call the full path** `C:\Users\barma\AppData\Local\Microsoft\WinGet\Packages\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\deno.exe`), Supabase CLI 2.117.0 (npm global).
  - Verification: `deno check` clean; function booted locally via `deno run` — `GET /health` → `{"status":"ok",...}`, CORS preflight 204 with correct headers, 404 handled. **Blocked**: no Docker → cannot run `supabase functions serve`.
- **Phase 1 — DONE (verified end-to-end).** All 5 existing Prisma migrations + 6th RPC migration applied to Supabase project `cuhngnehtlswsdemsdpr` (via MCP, in order); `supabase/seed.sql` applied (bcrypt hashes precomputed).
  - Verified: 11 tables, 8 RPCs (+ `_lf_err`) with correct signatures/`SECURITY DEFINER`; seed data present; `dashboard_stats`, `users_with_report_counts`, `create_match_and_notify`, and the full claim lifecycle (create → approve → start/complete handover → statuses + notifications) all return correct envelopes; negative paths return `{ok:false,status,error}` (400/403/404) — matches claimController/matchingService logic.
  - RPC bugs caught & fixed via `20260924140000_rpc_default_ids` (+ two focused MCP fixes): missing `id` (`gen_random_uuid()`), missing `Claim.updatedAt`, unquoted `u.communityId`.
- **Phase 3 — DONE (2026-09-25).** `client/src/utils/compressImage.js` (canvas → max edge 1500px, JPEG q 0.8→0.3 steps, target ≤1MB, output `*.jpg`/`image/jpeg`) wired into `ReportLost`, `ReportFound`, `ReportEdit` (`data.append('image', await compressImage(image))`). `npm run build` green. End-to-end image path verified via `tests/flows/image.flow.ts` (10/10 PASS with a real ~1MB JPEG): non-image 400, create FOUND with photo → Cloudinary `secure_url`, public fetch 200 + image content-type, public list + detail expose `imageUrl`, PUT replaces the URL, cleanup delete. Final in-browser check (upload a real 5MB photo from the Vite app) is a short manual step.
- **Cloudinary signature bug (found by the image flow, fixed)**: our `signParams` included `resource_type`, but Cloudinary excludes it from the signature string (it is carried in the request URL path `/image/upload`). The API rejected every upload with `Invalid Signature`; the fix in `_shared/cloudinary.ts` drops `resource_type` before signing (destroy path too). Admin-API listing uses Basic auth (`api_key:api_secret`), not signed params.
- **Deploy note (Phase 4)**: the Edge Function limits request bodies to ~2MB — the client pre-compression to <1MB is what keeps real uploads inside it. A local `deno run` server has no such limit, so local probing can use up to the 5MB `MAX_FILE_SIZE` cap without implying a deployed upload would land.
- **Phase 2 — VERIFIED end-to-end (2026-09-25).** Full integration flow (`tests/flows/integration.flow.ts`): 86 checks across auth, reports, matching, claims/handover, notifications, admin, events/categories/communities, search + found-feed — **86 passed, 0 failed** against the hosted DB via `deno run --allow-env --allow-net` (see Phase 2 notes below). Unit tests (13 suites / 64 steps) also green. The flow script is committed as the Phase-2 verifier; run it with `deno run --allow-env --allow-net tests/flows/integration.flow.ts` (sets a random `x-forwarded-for` to dodge the 100 req/15 min per-IP limiter).

## Goal

Move the Lost&Found platform's deployment target:

- **Backend + Database** → Supabase (Edge Function for the Express API, Supabase Postgres for the DB)
- **Images** → stay on Cloudinary (unchanged), reach them via client-side pre-compression
- **Frontend** → a new Vercel account (new Vercel project, same repo)
- **Data** → start fresh (no migration of existing production data)

## Target Architecture

```
Browser (React SPA) ──► Supabase Edge Function "api" (Deno + Oak) ──► Supabase Postgres (PostgREST + SQL RPC)
                                │
                                └──► Cloudinary (image upload, unchanged)
```

- **Backend**: single Supabase Edge Function (`supabase/functions/api`) rewriting the Express app 1:1 — same routes, same JSON shapes, same JWT+bcrypt auth, `{ error }` envelope, 401 only for real auth failures, 403 for authorization. ~43 endpoints across 11 route groups.
- **Database**: Supabase Postgres, started fresh. **Prisma is the single migration authority** — existing 5 migrations are applied via `prisma migrate deploy`, and the SQL RPC functions are shipped as a 6th Prisma migration. The runtime never uses Prisma. (On this machine, with no `DATABASE_URL` and no Docker, migrations were applied via the Supabase MCP instead — see Phase 1 notes.)
- **Images**: stay on Cloudinary. Client pre-compresses to ~1500px / <1MB before upload so the request fits the ~2MB Edge Function body limit; Edge Function forwards bytes to Cloudinary; secure URL stored in `item.imageUrl`. The `/uploads` disk path is dropped (also fixes relative `/uploads` 404s on Vercel).
- **Frontend**: only changes are `VITE_API_URL=https://<ref>.supabase.co/functions/v1/api` and a `compressImage` util wired into the 3 upload forms (`ReportLost`, `ReportFound`, `ReportEdit`). Deployed on a new Vercel account. 401 hard-redirect to `/login` preserved exactly.
- **Auth**: keep custom JWT (`jose` HS256, payload `{ userId }`, 7d) + bcryptjs inside the Edge Function. Frontend keeps sending `Authorization: Bearer`.
- **Critical deploy flag**: the function must deploy with **`verify_jwt` disabled** — the Authorization header carries our custom HS256 token, not a Supabase JWT; default JWT verification would reject every request.

## Platform Constraints (confirmed)

- Supabase Edge Functions: 150s max, ~2MB request body, 20MB bundle (deploy with local CLI bundling), no shared filesystem, no built-in rate-limit middleware.
- CORS/security headers/rate limiting handled in code (`ALLOWED_ORIGINS`).
- Complex atomic operations (claim state machine, match persistence, dashboard stats) move to Postgres RPC functions instead of `prisma.$transaction`.
- `verified` scope: the current `/uploads` static serving is dev-only (production already uses memory storage → Cloudinary); the client renders `imageUrl` as a full URL everywhere, so dropping `/uploads` is safe.

## Decisions (confirmed)

1. **Image upload**: client-side pre-compression (canvas ~1500px, JPEG q~0.8, <1MB). No direct-to-Cloudinary, no lower cap.
2. **Migration authority**: Prisma only. Add RPC functions as a 6th migration, apply via `prisma migrate deploy`. Supabase CLI used only for functions deploy/secrets.

---

## Phase 0 — Foundations & dev environment

- Add `supabase/` at repo root; `supabase init`, create/link the Supabase project.
- Create the `api` function skeleton + `_shared/`:
  - `cors.ts` (allow `localhost:5173`, `127.0.0.1:54321`, new Vercel origin from `ALLOWED_ORIGINS`)
  - `headers.ts` (security headers)
  - `error.ts` (error handler mirroring `server/src/middleware/errorHandler.js`: Zod → 400, P2002 → 400, P2025 → 404, LIMIT_FILE_SIZE → 400, else 500)
  - `body.ts` (JSON + `await req.formData()` parsing)
  - `auth.ts` (`authenticate`: Bearer → jose HS256 → DB lookup user id/name/email/role/communityId; `requireAdmin`)
  - `db.ts` (supabase-js admin client, service role)
  - `cloudinary.ts` (raw signed multipart upload/destroy via fetch)
  - `ratelimit.ts` (per-IP windowed limiter, 100/15min)
- Update `.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `CLOUDINARY_*`, `ALLOWED_ORIGINS`.
- **Verify**: `deno check` green + local smoke test of the served function (`/health`, CORS preflight, 404). Full `supabase functions serve` verification would require Docker (unavailable here) — instead the live-function checks run via `deno run --allow-env --allow-net` against the hosted project (see Phase 2 notes).

## Phase 1 — Database on Supabase (start fresh)

- Apply existing Prisma history against Supabase `DATABASE_URL` (ssl=require) via `npx prisma migrate deploy`.
- **6th Prisma migration** with the SQL RPC functions:
  - `approve_claim(p_claim_id, p_admin_notes, p_admin_id)` — atomic, replicating claimController approve (`updateMany` report guard + claim guard + competing-claim rejection + CLAIM_APPROVED notifications)
  - `reject_claim(p_claim_id, p_admin_notes)` — claim guard + CLAIM_REJECTED notification
  - `start_handover(p_claim_id)` / `complete_handover(p_claim_id)` — guards, timestamps, reports → RETURNED, SYSTEM/ITEM_RETURNED notifications
  - `create_claim(p_match_id, p_claimant_id, p_verification_details)` — match 404, lost-owner 403, community guard, duplicate catch, claim insert + CLAIM_SUBMITTED notifications
  - `create_match_and_notify(p_lost_report_id, p_found_report_id, p_score)` — insert Match (0..100 score guard; duplicates return existing id), flip both reports → POSSIBLE_MATCH, MATCH_FOUND notification
  - `dashboard_stats()` — 7 counts in one row; `users_with_report_counts()` — users + `_count.reports`
- All RPCs are `SECURITY DEFINER`, `SET search_path = public`, return `jsonb {ok,...}` envelopes (errors `{ok:false,status,error}` via `_lf_err`), `EXECUTE` revoked from `PUBLIC/anon/authenticated`, granted to `service_role` only.
- Port the seed from `server/prisma/seed.js` (admin + demo users with bcrypt hashes, communities, categories, event, demo reports/matches) as a Prisma seed against Supabase. (`Location` was never seeded; leave as-is.)
- **Verify**: tables + RPCs created; seed idempotent; each RPC exercised (happy + guard paths).

### Phase 1 notes (learned while implementing)

- `supabase link` needs an interactive access token (MCP project ref `cuhngnehtlswsdemsdpr` was used instead).
- With no remote `DATABASE_URL` and no Docker, migrations/seed were applied **via the Supabase MCP** (`apply_migration` batches, in historical order) rather than `prisma migrate deploy`. The `prisma/migrations/` folder remains the canonical history; the 6th migration ships the RPCs.
- Migration folder `20260924130000_supabase_rpc_functions` = RPCs v1; `20260924140000_rpc_default_ids` = follow-up fixing three RPC-side bugs found when exercising the functions (see History). Both stay on disk as the canonical record.
- **All id columns are `TEXT NOT NULL` with no DB default** (Prisma generates ids client-side). RPC-created rows must supply `gen_random_uuid()::text` (Match, Claim, Notification inserts). Same for `createdAt/updatedAt` on `Claim` (`updatedAt` has no default).
- Quotes matter: `u.communityId` (unquoted) folds to `communityid` and breaks; always `u."communityId"` in RPC bodies.
- `supabase/functions/deno.json` import map pins Oak **17** (new body API `ctx.request.body.json()/.formData()`, no `Application.fetchHandler` → `Deno.serve((req) => app.handle(req))`).
- `supabase/seed.sql` mirrors the Prisma seed in SQL (bcrypt hashes precomputed, deterministic row ids, `ON CONFLICT` upserts, guarded demo-report block). MCP `execute_sql` runs the whole batch atomically — keep seed files fully consistent per-run.
- Advisors flag `rls_disabled_in_public` (11 tables): **intentional** — no untrusted client reaches PostgREST directly; the only DB access path is the Edge Function's service-role client + service_role-gated RPCs (auth/RBAC enforced in function code, same as Express).

## Phase 2 — Port the API to the Edge Function (bulk of work)

Structure under `supabase/functions/api/`:

- `_shared/`: db client, jwt (jose), cloudinary, error helpers, response/status helpers, ratelimit.
- Port every route group to Oak routers preserving response contracts (source: `server/src/routes/*` + controllers):
  - **auth**: register/login/me (bcryptjs + jose; 201 register, 400 "Email already registered", 401 invalid credentials)
  - **reports**: create/update handle FormData `image` (pre-compressed, JPEG/PNG/WEBP) → Cloudinary; list/my/detail/update/delete; privateDetails stripping; `getReportMatches` live ranking
  - **matching**: port pure functions (`featureExtractor`, `similarity`, `ruleBasedMatcher`, `aiMatchingService`) to Deno-agnostic TS; `findEligibleCandidates` via supabase-js (same-community filter, exclude same user), `rankMatches` stays pure; `findMatches` loop calls `create_match_and_notify`
  - **claims**: create/get/getById/status/handover via RPC functions; role-based sanitization (`adminNotes`, `privateDetails`) and `matchIncludeForRole` ported exactly
  - **notifications**: list/unread-count/mark-read/read-all
  - **admin**: dashboard + users via RPC; reports list/flag/unflag/status (AuditLog + REPORT_UPDATED notification); role updates; audit logs
  - **events / categories / communities**: CRUD with admin guards
  - **search + found-feed**: supabase-js chains; **search keeps today's no-community-scope behavior** (parity); found-feed uses `REPORT_SELECT` safe projection + `buildCommunityFilter`; pagination capped at 50
- Drop `/uploads` static serving everywhere; `imageUrl` is always a full Cloudinary URL.
- Rate limiting: Postgres/in-memory per-IP window — port of `express-rate-limit` 100/15min.
- Port unit tests (`matchingEngine`, `matchingService`, `validators`) to `deno test`; rewrite integration/flow tests (`claimWorkflow`, `integration`, `foundFeed`) as fetch-based tests against the served function.
- **Verify**: `deno test` green; full manual flow against the live function — run `deno run --allow-env --allow-net index.ts` with env vars pointed at the hosted project, then exercise register → report+upload → match → claim → approve → handover → notifications → admin (works without Docker — see Phase 2 notes on "no Docker" alternative).

### Phase 2 notes (learned while implementing)

- **Docker is NOT required.** `supabase functions serve`/`supabase start` (the only CLI features needing Docker) are local-emulation conveniences. Migrations/seed ship via MCP; the function is verified with `deno check`/`deno test`/`deno run`; `supabase functions deploy --no-verify-jwt` bundles with esbuild and needs no Docker. The lack of Docker only removes one optional verification step, not a blocker.
- **Alternative to `functions serve`**: run the function directly against the hosted DB — set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `ALLOWED_ORIGINS`, (optional) `CLOUDINARY_*` locally, then `deno run --allow-env --allow-net index.ts` (listens on `:8000`) and hit it like the deployed `/functions/v1/api`. Endpoint/runtime behavior is identical since the code has no local-DB dependency.
- **All code is written** under `supabase/functions/api/`: `_shared/{filters,selectors,rpc,validate,request,image,bcrypt}.ts` + updated `error.ts`/`env.ts`; `matching/{similarity,featureExtractor,ruleBasedMatcher,aiMatchingService,matchingService}.ts`; `validators/{auth,report,claim}.ts`; 11 routers (`auth,reports,matches,claims,notifications,admin,events,categories,communities,search,foundFeed`); wiring in `index.ts`.
- **Verification status 2026-09-25**: `deno check index.ts` green; `deno test --allow-env tests/` → **13 suites / 64 steps all pass** (`tests/{validators,matchingService,matchingEngine}.test.ts`); `deno run --allow-env --allow-net index.ts` boots and listens on `:8000`. **Integration flow VERIFIED**: committed `tests/flows/integration.flow.ts` runs against the hosted DB via the env-var + `deno run` approach → **86/86 PASS (afdfafad)**, unit tests still green afterwards.
- **Route prefixing (caught during verification)**: every Oak router must declare its mount prefix (`new Router({ prefix: "/api/<resource>" })` + `/api/health`) because Express serves everything under `/api` (`server/src/app.js:40-52`); an unprefixed router answers under `/` and 404s the client.
- **PostgREST quirks hit in the flow (all fixed):** (1) `PGRST201` on `Match↔Report` — two FKs to Report → disambiguate with `Report!Match_lostReportId_fkey` / `Report!Match_foundReportId_fkey` hints in selects. (2) `PGRST100` — `or()` logic trees reject dotted embedded refers (`item.title.ilike.*...`) → text search resolves Item ids in one item-level query, then unions `or(itemId.in.(ids),location.ilike.*...)`. (3) Filtering on an embedded column (`?item.category=eq.X`) does NOT filter parent rows on this PostgREST — it LEFT-joins and just nulls the embed — so category/color/brand filters on `Item` now resolve Item ids first and filter `Report` on `itemId.in.(...)` (search, reports list, found-feed). (4) `not.in` values must be unquoted enum constants (`(CLAIMED,RETURNED,CLOSED)`).
- **Auth-order bug (caught in flow)**: admin-guarded routers (events/categories/communities) must run `authenticate` before `requireAdmin` or `ctx.state.user` is never set → 403 for everyone.
- **admin transition guard inverted in the Express source** (`adminController.js:89` maps `existing.status` but the map is target-keyed) — the Deno port uses `invalidTransitions[status]?.includes(existing.status)` deliberately (bug fixed, error message preserved).
- **Integration flow hygiene**: make each run's category/title/description include a run-unique token so leftover run artifacts can never cross-match subsequent runs; the DB no longer has a `context`"cleanup-contract — flow residue cleaned via MCP SQL after green runs (FK order: claims → matches → audit logs → reports → notifications → items → events/categories/communities → users).
- **Import map additions**: `zod` (`npm:zod@^3.24.1`, resolved 3.25.76), `@std/testing`, `@std/assert` for tests. `bcryptjs` (2.4.3) resolves cleanly under Deno (wrapper has `@ts-ignore`).
- **supabase-js typing gotchas** (all resolved): custom structural handler types lack Oak's `Context.response` → use Oak `Context`; `rpcCall` + `.select()` results type as `GenericStringError`/`unknown` → cast through `unknown`; embedded foreign keys (`match:Match(...)`) infer as arrays → cast to explicit interfaces (e.g. `HandoverClaim`).
- **foundFeed bug fixed during port**: order/range must be chained onto the query builder BEFORE the first `await` (applying `.order().range()` after `Promise.all` had already executed the builder silently ignored pagination).
- **Supabase module namespace objects are NOT mutable** in Deno (assignment throws) — `findEligibleCandidates` takes an optional client param (`client: ReturnType<typeof db> = db()`) so unit tests inject a fake query builder and assert on recorded `eq`/`in` ops instead of `vi.mock`.
- **Privacy decisions (deliberate improvements over Express, verified in code)**: public `GET /api/reports` list + `/api/search` use `ITEM_PUBLIC` (no `privateDetails` — Express leaked it); admin `updateUserRole` response excludes `passwordHash`; claims/matches sanitizers strip `adminNotes`/`privateDetails` for non-admins.
- **404 message parity**: event/category/report/claim/notification GET+update missing rows return the Express `P2025` messages verbatim.

## Phase 3 — Client image pre-compression

- New `client/src/utils/compressImage.js`: canvas downscale to max edge ~1500px, export JPEG q~0.8, target <1MB.
- Wire into `ReportLost`, `ReportFound`, `ReportEdit` (replace `if (image) data.append('image', image)`).
- **Verify**: a 5MB photo submits successfully through the served function; image renders back from Cloudinary.
- **Status 2026-09-25**: DONE — util + wiring + build green; server upload path verified 10/10 (`tests/flows/image.flow.ts`). Remaining: optional in-browser 5MB-photo smoke test via `npm run dev`.

## Phase 4 — Deploy backend & new Vercel

> **Status 2026-09-25: DONE.** Backend deployed + verified; new Vercel frontend live. Details:
> - Secrets set on project (Digest listed via `supabase secrets list`): `JWT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `ALLOWED_ORIGINS` (`http://localhost:5173,http://127.0.0.1:54321,https://lost-found-client.vercel.app`). `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are SUPABASE-injected defaults — `supabase secrets set` refuses `SUPABASE_`-prefixed names and they are present at runtime without being set.
> - Deploy: `supabase functions deploy api --no-verify-jwt --use-api --import-map ./supabase/functions/deno.json` (must pass `--import-map` — the deploy bundler does NOT auto-read `deno.json`; first attempt without it failed with `Relative import path "oak" not prefixed`).
> - Verified: `GET /functions/v1/api/health` → 200 `{"status":"ok"}`, `verify_jwt=false` (confirmed via MCP list), CORS preflight from `http://localhost:5173` AND `https://lost-found-client.vercel.app` → 204 with correct `Access-Control-Allow-Origin`; login round-trip 200 with token + ACAO header. Bundle includes no tests/flow files.
> - New Vercel project `lost-found-client` (account `barmanpawan524-6246`, org `pawan-a6f7`, reused account; old `lost` project/Express env vars left untouched): root dir `client` (local settings via `vercel.json` → framework vite, output `dist`, build `npm run build`), GitHub repo connected, `VITE_API_URL` set for Production + all Preview branches to `https://cuhngnehtlswsdemsdpr.supabase.co/functions/v1/api`. Production deploy: **https://lost-found-client.vercel.app** (built bundle confirmed to embed the Supabase function URL; login from that origin returns 200 + token).
> - Local `.env` (`supabase/functions/api/.env`, gitignored) updated to include `ALLOWED_ORIGINS` with the new Vercel domain for parity.
> - **Forgot/reset-password + v4 redeploy (2026-09-25)** — added `POST /api/auth/forgot-password` + `POST /api/auth/reset-password` (`routers/auth.ts`, `jwt.ts` `generateResetToken`/`verifyResetToken`, `RESET_TTL_SECONDS=1800`), committed `031b11e` and pushed (Vercel auto-deployed). Live verification: forgot for a registered user → 200 `{message, resetToken, expiresInSeconds:1800}`; reset with token → 200 "Password updated…" and the new password logs in (old password now 401); garbage token → 400 "Invalid or expired reset token"; unknown email → generic 200 "If that email is registered…". Found + fixed a real 5xx bug en route: Oak `BadRequestError`/`HttpError` fell through `toErrorResponse` to 500 → `_shared/error.ts` now handles `instanceof HttpError` → `err.status`. Redeployed as **v4** via MCP (SHA `620f5065a9bb4a6b615ab7812c754628d32e7518a2de905a4a91048e4a2ded10`, function id `44492887-1032-4ed2-964c-f47fefced162`) and re-verified live: malformed JSON → **400** (was 500), health 200, register 201 / login 200, CORS intact. Transport gotcha (PowerShell 5.1): passing JSON with spaces via `curl.exe -d "..."` mangles the body into a 400 parse error — use `ConvertTo-Json -Compress | curl.exe -d "@-"` (stdin read).

- Apply migration/RPCs/seed to the Supabase project.
- `supabase secrets set JWT_SECRET CLOUDINARY_* ALLOWED_ORIGINS`.
- `supabase functions deploy api --no-verify-jwt` (local/CLI bundling for ≤20MB; **verify_jwt disabled — our Auth header is a custom HS256 token, not a Supabase JWT**).
- **Verify**: `https://<ref>.supabase.co/functions/v1/api/health` answers; CORS works from localhost + new Vercel domain.
- New Vercel account: import repo (root dir `client`, framework Vite) → `VITE_API_URL=https://<ref>.supabase.co/functions/v1/api` → deploy. `client/vercel.json` unchanged.

## Phase 5 — Cutover & decommission

- Flip `VITE_API_URL` on the new Vercel project to the deployed function URL; production smoke tests.
- Delete Render backend service + Render Postgres; remove old Vercel project/account (manual, dashboard actions). Keep `server/` in the repo as reference until cutover is done.

---

## Risks / Decisions to confirm

1. ~~Upload size vs ~2MB Edge Function body limit~~ → **decided + implemented**: client-side pre-compression (Phase 3) keeps requests ~≤1MB. The old 5MB cap is dropped. Verified server-side 10/10 (image.flow.ts); in-browser 5MB smoke test optional.
2. **401 semantics** must stay exact — client hard-redirects to `/login` on any 401 (`client/src/utils/api.js:22`). Login's own 401 also triggers it today; preserve.
3. **Verify that `create_match_and_notify` is an improvement, not a strict port** — current `matchingService.findMatches` is sequential/non-atomic (matchingService.js:146-170); RPC makes match persistence atomic.
4. **Keep Express code intact** in `server/` as reference until Phase 5 cutover (also powers local dev until the function is ready).

## Scratch notes (verified during plan audit, do not delete)

- `server/prisma/seed.js` EXISTS (admin@leftbehind.com/admin123, john+jane@example.com/user123, 3 communities, 9 categories, 1 event). Plan originally claimed it didn't.
- Search route (search.js) is NOT community-scoped today — preserved for parity.
- `Location` table exists in schema but is unused by any route and unseeded.
- Claim/match flows requiring RPCs are at `claimController.js:194-287` (approve), `:289-326` (reject), `:351-459` (handover), `:61-155` (create); match persistence at `matchingService.js:146-170`.
- Matching pure modules: `featureExtractor.js`, `similarity.js`, `ruleBasedMatcher.js`, `aiMatchingService.js` (rankMatches pure; findEligibleCandidates needs DB).
- auth middleware: `server/src/middleware/auth.js` — 401 for missing/invalid/no-user, 403 `requireAdmin`.
- Client API base: `client/src/utils/api.js:3` → `import.meta.env.VITE_API_URL || 'http://localhost:5000/api'`. Dev: function serves at `http://127.0.0.1:54321/functions/v1/api`.

## Repo paths involved

- New: `supabase/` (functions, config.toml, migrations, seed)
- Edit: `.env.example`, `client/src/utils/compressImage.js` (new), `ReportLost/ReportFound/ReportEdit`, frontend `VITE_API_URL` (Vercel env)
- Reference only: `server/`, `prisma/`, `client/`