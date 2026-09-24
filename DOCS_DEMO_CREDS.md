# Demo Credential Removal — Handoff Notes

> Date: 2026-09-25 · Status: **All 4 work items complete + verified.** Phase 5 (cutover) remains paused/pending.

## What was removed

| Surface | Where | Result |
|---------|-------|--------|
| **Live Supabase DB** | hosted Postgres | Deleted seeded demo users `usr-admin`/`usr-john`/`usr-jane` + all cascaded data (12 notifications, 3 demo FOUND reports, 6 demo items) in one FK-safe transaction. Live DB now: **1 real user** (`p@mail.com`, id `285b3552`), their 1 LOST report (`daf33662`, kept item `2946b2a0`), 2 orphaned UUID items. Verified via counts: users=1, reports=1, items=3, notifications=0. |
| **Client UI + docs** | `client/src/pages/Login.jsx`, `README.md` | Demo credentials box stripped from Login + credentials table removed from README. |
| **Seed files** | `supabase/seed.sql`, `server/prisma/seed.js` | Rewritten to **reference data only** (3 communities, 9 categories, 1 event) — **no users, no reports, no matches**; idempotent. `com-campus` community id preserved for flows. |
| **Flow tests** | `supabase/functions/api/tests/flows/integration.flow.ts` + `image.flow.ts` | Rewritten to register throwaway users at runtime instead of logging into seeded accounts. Throwaway users are bootstrapped via Supabase service-role `@supabase/supabase-js` client: `setRole(userId,"ADMIN")` + `setCommunity(id,"com-campus")`. Admin/owner/other auth checks re-pointed at the throwaway identities. |

## Verification
- `deno check` green on both rewritten flow files + `image.flow.ts`/`integration.flow.ts` (they import `@supabase/supabase-js` via the api import map).
- Repo-wide grep for demo emails/passwords is clean — only remaining matches are intentional keeps:
  - `server/tmp-e2e.mjs:136` — scratch script for the **retired legacy Express server** (would now correctly fail at login since its seed no longer creates demo users).
  - `MIGRATION_PLAN.md:172` (historical) + `MIGRATION_COMPLETE_PLAN.md:172` — plan/history audit note, not a live credential.
  - `Contact/Privacy/Terms.jsx` + `.app` contact emails — legal/contact strings, not login credentials.

## Kept intentionally (out of scope)
- `server/` Express app + `server/prisma/seed.js` retained as reference/pkg for cutover (Phase 5); demo data there was also removed from seed but app kept.
- The `Event`/`Community`/`Category` reference rows (not credentials).

## To run the flows (resume Phase 4/5 verification later)
Flows need a running API + env: `BASE_URL` (or hosted function URL), and for the service-role bootstrap: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (e.g. from `supabase/functions/api/.env`).
- Integration: `deno run --allow-env --allow-net tests/flows/integration.flow.ts` (compact, self-bootstrapping; expects a locally served API on `BASE`/`:8000` upstream or the deployed function URL).
- Image: `deno run --allow-env --allow-net tests/flows/image.flow.ts` with `TEST_IMAGE` set + `.env` Cloudinary creds.

## Next (Phase 5 — Cutover, still pending)
Point the Vite app at the deployed Supabase Edge Function, deploy/verify the new Vercel project, retire legacy `server/` + old Render/Express + old Vercel project (see `MIGRATION_COMPLETE_PLAN.md` Phase 5 for details).
