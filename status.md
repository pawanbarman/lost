``# Cleanup Status — Lost & Found

Last updated: 2026-10-02 · Repo: `P:\lost` · Branch: `master`

Plan of record: the 6-phase cleanup agreed on 2026-09-29. Phases 0, 1, 2a, 2b, 3, 3b, 3c, 4 are
**done and verified**; Phase 5 is **done** (README rewritten, stale handoff docs deleted). This file
is the fast-orientation doc — `README.md` is the public-facing one.
The old `MIGRATION_COMPLETE_PLAN.md` (Render→Supabase history) and `DOCS_DEMO_CREDS.md` were deleted
in Phase 5; anything still worth keeping was carried into this file or `README.md` first.

---

## 1. Current state

### Done & verified

**Phase 3b — Password reset over SMTP** ✅ *delivery confirmed, `api` v10* (see §3)
**Phase 3c — Public-database lockdown** ✅ *RLS deny-all on all 10 tables* (see §3)
**Phase 4 — Client route guards + 404** ✅ *verified in headless Chrome* (see §3)
**Phase 5 — Docs** ✅ *README rewritten, stale handoff docs deleted* (see §3)

**Phase 0 — Toolchain** ✅
- Deno **2.9.7**, installed via winget and on the Windows user PATH. (The original manual install to
  `C:\Users\hp\.deno\` no longer exists on this box — see the environment table.)
- Prisma **5.22.0** installed at repo root (`node_modules/.bin/prisma`).
- `npm install` run in both root and `client/`.
- `client/.env.local` created → points at the deployed edge function.
- Baseline confirmed: `deno test` → **17 passed (112 steps), 0 failed**. (Was 13/64 before the
  ML image-matching tests landed — if you see 13/64, your checkout predates them.)

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
- Tag **`legacy-express-final`** → `dd016a2`. ⚠️ **This tag was never actually created** — `git tag -l`
  is empty. The 49 `server/` files are still recoverable from commit `dd016a2`; see the rollback
  section at the end.
- `prisma/schema.prisma:3` — removed `output = "../server/node_modules/.prisma/client"`.
  **This was load-bearing:** without it, `prisma generate` `mkdir -p`s a fresh `server/` back into
  existence, silently undoing the delete.
- `git rm -r server uploads` → **50 files deleted** (49 `server/` + `uploads/.gitkeep`).
- `.gitignore` — 6 `uploads/*` lines removed.
- Verified: `prisma generate` now writes to root `node_modules/@prisma/client`; **`server/src` does
  not exist** after generate; `deno test` green (13/64 at the time, 17/112 today); client build passes.

### Phase 2b — Drop the `Location` table ✅
Applied to the live DB on 2026-09-29 as migration `20260929193516_drop_location_table`.

- Verified before dropping: `Location` held **0 rows**, **zero** foreign keys referenced it, **zero**
  DB functions mentioned it, and **no** application code touches the table. Every `location` hit in
  the codebase is the lowercase text column on `Item`/`Event`/`Report` — a different thing entirely.
- The 2 orphaned `Item` rows (5 Items / 3 Reports) were **confirmed and deleted**: both were test
  residue — `Flow Photo Item 2e901eb1` (integration-flow artifact) and `orange bag` (demo seed).
  `Item` is now 3 rows, orphan count 0.
- `prisma/schema.prisma` — removed the dead 5-line `model Location` (was 240 lines, now 234).
- Tracked at `supabase/migrations/20260929193516_drop_location_table.sql`.
- Verified: `Location` absent from `public`; `prisma generate` succeeds and does **not** recreate a
  `server/` directory; `deno test` → 17/112 green; live `/health` → 200.

> **`prisma migrate deploy` is the WRONG tool for this repo — do not use it.** There is no
> `_prisma_migrations` table anywhere. The schema was applied by the Supabase CLI, which records
> history in `supabase_migrations.schema_migrations`. Prisma would read an empty history and try to
> replay all 7 local migrations from scratch, failing on `CREATE TABLE "Location"`. The version
> strings don't overlap either: local `prisma/migrations/` are `20260825120422`…`20260924140000`,
> live are `20260924182917`…`20260924183534`. Two live migrations (`apply_rpc_quote_fix`,
> `apply_claim_timestamps`) have no local folder at all.
> **Use `supabase_apply_migration` (MCP) instead**, then read the assigned version back with
> `SELECT version FROM supabase_migrations.schema_migrations WHERE name = '…'` and name the
> `supabase/migrations/` file with that exact version — otherwise a future `supabase db push` sees
> the file as unapplied and re-runs it.
> `prisma/migrations/` is a fossil. Its `init` still contains `CREATE TABLE "Location"`; leave it,
> never edit an applied migration.

> **⚠️ Gotcha hit for real during Phase 3c.** `supabase_apply_migration` assigns its *own* version
> (`20261001181538`), which does **not** have to match the timestamp in the filename you wrote. The
> RLS file was authored as `20260930213000_enable_rls_deny_all.sql` but recorded remotely as
> `20261001181538`, so `supabase migration list` showed it as *unapplied locally* — a future
> `supabase db push` would have re-run every `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and died on
> duplicate objects. **Always run `supabase migration list` after applying and rename the file to the
> version the server actually assigned.** Both histories now line up.

### Phase 3 — Close the reset-token account-takeover hole ✅
**Deployed to production 2026-09-29 as `api` v5** (SHA `6ca6108a`, `verify_jwt: false` preserved).

The old `POST /api/auth/forgot-password` returned a working 30-minute `resetToken` in the JSON body for
any registered email — a complete account takeover. **Reproduced live first** (throwaway account), then
closed, then re-verified live.

- New `_shared/email.ts` — `sendPasswordReset()` over **SMTP on raw Deno sockets** (see Phase 3b for
  the full record). **No SDK, no new dependency.** Reads `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` /
  `SMTP_PASS` / `SMTP_SECURE` / `MAIL_FROM` / `APP_URL` at call time, so it stays testable.
- New `_shared/smtp.ts` — a minimal SMTP submission client: implicit TLS on 465, otherwise **STARTTLS
  is mandatory** and the client refuses to authenticate if the relay will not upgrade, so credentials
  are never put on the wire in the clear. `AUTH PLAIN` (initial response) and `AUTH LOGIN`, multiline
  `250-` replies, RFC 5321 dot-stuffing, per-operation timeouts, and `close()` in a `finally`.
- `routers/auth.ts` — the endpoint checks email config **before** touching the DB or minting a token
  and fails closed with **503** when config is incomplete. Configured, it emails the link and
  returns one generic body on *every* path, so account existence never leaks.
- `client/src/pages/ForgotPassword.jsx` — token-surfacing branch deleted; shows the generic confirmation.
- `_shared/env.ts` — deleted the `nodeEnv: key("NA", …)` typo line (it is referenced nowhere).
- `.env.example` — the three Resend vars replaced with the seven SMTP vars.
- New `tests/helpers/fakeSmtp.ts` — a stateful in-process SMTP server that stubs
  `Deno.connect` / `connectTls` / `startTls`, so the tests drive the **real** client through a genuine
  banner → EHLO → STARTTLS → AUTH → MAIL → RCPT → DATA → QUIT conversation.
- New `tests/smtp.test.ts` and rewritten `tests/forgotPassword.test.ts`.

**Live verification after deploy** (throwaway account `sec-test-665c305b@example.test`, since deleted):

| Request | Result |
|---|---|
| `GET /api/health` | 200 |
| `GET /api/categories` | 200, real rows |
| `POST /api/auth/login` | 200, JWT issued |
| `POST /api/auth/forgot-password` — known email | **503**, body has no `resetToken` |
| `POST /api/auth/forgot-password` — unknown email | **503**, byte-identical body (no enumeration) |
| `POST /api/auth/forgot-password` — missing / non-string email | 400 validation |
| `POST /api/auth/reset-password` — no token | 400 (unchanged) |

⚠️ **Password reset is now OFF in production, not broken.** The 503 is the intended fail-closed
behaviour and it is what closes the hole. Real reset emails need `SMTP_HOST`, `MAIL_FROM` and
`APP_URL` set as edge secrets (`APP_URL=https://lost-found-client.vercel.app`) plus working
relay credentials. Until then the UI surfaces the "contact support" error.

**Credential-pair rule:** `SMTP_USER` and `SMTP_PASS` must be set *both* or *neither*. Setting only
one is treated as a misconfiguration and disables email entirely, so a half-finished setup fails
loudly at the config check instead of sending unauthenticated mail. Both empty is legitimate for a
trusted local relay; `SMTP_SECURE` is inferred from the port (465 → implicit TLS) and only needs to
be set explicitly to override.

### Working tree
Phases 0, 1, 2a are committed and pushed (`df69cbb`), plus `status.md` (`5456b5a`). Phases 2b **and 3**
are applied/deployed to production but **not committed**:

```
 M .env.example                                          (SMTP_* / MAIL_FROM / APP_URL)
 M client/src/pages/ForgotPassword.jsx                   (token UI removed)
 M prisma/schema.prisma                                  (model Location removed)
 M status.md
 M supabase/functions/api/_shared/env.ts                 (nodeEnv typo line deleted)
 M supabase/functions/api/routers/auth.ts                (503 gate; no token in response)
?? supabase/functions/api/_shared/email.ts               (new — SMTP transport)
?? supabase/functions/api/_shared/smtp.ts                (new — SMTP protocol client)
?? supabase/functions/api/deno.json                      (new — REQUIRED for deploys, see table)
?? supabase/functions/api/tests/forgotPassword.test.ts   (new)
?? supabase/functions/api/tests/smtp.test.ts             (new)
?? supabase/functions/api/tests/helpers/fakeSmtp.ts      (new)
?? supabase/migrations/20260929193516_drop_location_table.sql
```

`MIGRATION_COMPLETE_PLAN.md` was deleted in Phase 5, so it no longer appears in `git status`.

---

## 2. Environment facts (these cost real time to discover)

| Fact | Detail |
|---|---|
| **Supabase project ref** | `cuhngnehtlswsdemsdpr` — **verified live**, `/api/health` returns HTTP 200 |
| **Supabase MCP server — FIXED** | It now reports `cuhngnehtlswsdemsdpr`, the correct project. (It previously reported `mfthnsnoredjcqnkuzjw`.) MCP `execute_sql`, `apply_migration`, `list_migrations`, `deploy_edge_function` all work. **Caveat: this MCP server still exposes NO secrets tool**, so edge-function secrets still need the real CLI or the dashboard. |
| **DB server clock runs ~1 day behind** | A migration applied on "2026-09-30" local was stamped `20260929193516` by Postgres. Always trust `supabase_migrations.schema_migrations`, not your own date. |
| **Never run `npx prisma`** | It tries to fetch `8.0.0-rc.17` and dies `ECOMPROMISED / Lock compromised`. Use `./node_modules/.bin/prisma`. |
| **`prisma validate` fails bare** | `P1012 Environment variable not found: DATABASE_URL`. Pre-existing, not a regression — there is no `.env` anywhere. Workaround for schema checks: `export DATABASE_URL="postgresql://user:pass@127.0.0.1:5432/postgres"`. |
| **Deno install script lies on this box** | `deno.land/install.ps1` printed "installed successfully" but left the dir **empty** — git-bash `tar` chokes on the `C:` path. Fixed via PowerShell `Expand-Archive`. Already done; only matters if reinstalling. |
| **Deno is now on PATH** | Installed via winget, not the manual install: `C:\Users\barma\AppData\Local\Microsoft\WinGet\Packages\DenoLand.Deno_Microsoft.Winget.Source_8wekyb3d8bbwe\deno.exe`. Version 2.9.7. Just call `deno` — the old `C:\Users\hp\.deno\bin` paths below are wrong for this box. |
| **git-bash + Deno** | `$USERPROFILE` is `C:\Users\barma`, which git-bash mangles in `PATH`. If `deno` isn't found, invoke the winget path above directly. |
| **Supabase CLI installed + usable** | `2.117.0` at `C:\Users\barma\AppData\Roaming\npm\supabase.ps1` (`2.118.0` available). Needs `SUPABASE_ACCESS_TOKEN` in the env or a `supabase login` token. The old "Supabase CLI not installed" note is stale. |
| ⚠️ **Import map must live INSIDE the function dir** | `supabase/functions/deno.json` is **not** uploaded by `functions deploy` — the CLI only ships files under `supabase/functions/<fn>/`. With no map the platform-side bundle dies: `Relative import path "oak" not prefixed with / or ./ or ../`. Fixed by the new `supabase/functions/api/deno.json` (a copy of the root one); the platform now reports `import_map_path: …/api/deno.json`. **Keep the two files in sync.** |
| ⚠️ **`deno.lock` is not deployed either** | It sits at `supabase/functions/deno.lock`, outside `api/`, so the platform re-resolves dependencies on *every* deploy. `^17.1.4` for `oak` now resolves **17.2.0**; v4 shipped with 17.1.6. Local `deno info` resolves the same, and a prefixed-router probe passes on both 17.1.6 and 17.2.0, so this is not a live defect — but a future breaking `oak` minor *would* reach production unreviewed. Pin exact versions, or move the lock inside `api/`. |
| ⚠️ **Probe URLs — never double the `/api`** | The runtime keeps the function slug in the path, so the live URL is `…/functions/v1/api/auth/login` and the Oak prefix is `/api/auth`. Probing `…/functions/v1/api/api/auth/login` returns an empty 404 and looks like a total outage — it cost three wasted probe rounds on 2026-09-29. `client/.env.local` `VITE_API_URL` + the router prefixes are the source of truth. |
| Not installed | Docker. Present: WSL2 + `kali-linux` distro, virtualization enabled, 8 GB RAM. |
| Deploy command | `supabase functions deploy api --project-ref cuhngnehtlswsdemsdpr`, **from the repo root**. Do **not** add `--no-verify-jwt`: `supabase/config.toml` has no `[functions.api]` block, so the CLI leaves the platform's `verify_jwt: false` alone (the function uses custom JWT, not Supabase Auth). Confirm with `supabase functions list` or MCP `list_edge_functions` after every deploy. |

### Commands that work

```bash
# Tests (from supabase/functions/api/) -- full suite: 20 passed (127 steps) + 1 KNOWN FLAKE
# NOTE: --config ../deno.json on purpose. Using --config deno.json (the new per-function map)
# makes Deno drop a second deno.lock inside api/ on every run.
deno test --config ../deno.json --allow-env --allow-net tests/

# Everything except the flaky ML-wiring test: expect 18 passed (96 steps), 0 failed
deno test --config ../deno.json --allow-env --allow-net --ignore=tests/mlImageWiring.test.ts tests/

# The Phase 3 security regression tests on their own: expect 4 passed (16 steps)
deno test --config ../deno.json --allow-env --allow-net tests/forgotPassword.test.ts

# Typecheck + lint (same dir)
deno check index.ts
deno lint matching/ tests/mlClient.test.ts tests/mlImageWiring.test.ts
```

⚠️ **`tests/mlImageWiring.test.ts` has a pre-existing timing flake**, unrelated to Phase 3. It sets
6 candidates, concurrency 2, 120 ms per request and a 250 ms deadline — but wave 3 starts at ~240 ms, so
the deadline can legitimately fire. It passes or fails run to run and imports nothing Phase 3 touched.
`tests/mlImageWiring.test.ts` is where to look if you want it made deterministic; do **not** "fix" it by
loosening the deadline without understanding the intent.

# Prisma (repo root) -- NEVER use `npx prisma`, see the table above
DATABASE_URL="postgresql://user:pass@127.0.0.1:5432/postgres" ./node_modules/.bin/prisma validate
./node_modules/.bin/prisma generate

# Client
cd client && npm run build
npm run dev          # from repo root; serves :5173, talks to the deployed function
```

---

## 3. What is left

### Phase 2b — `Location` table drop ✅ **DONE 2026-09-29**
See the Phase 2b section above for the full record. Summary: migration
`20260929193516_drop_location_table` applied via MCP; 0-row table dropped, 2 orphaned `Item` rows
deleted, `model Location` removed from `prisma/schema.prisma`, SQL tracked in
`supabase/migrations/`. All verification green.

**Still outstanding from the original 2b note:** the schema-history split is only *half* fixed. New
migrations go in `supabase/migrations/`, but the 9 pre-existing ones (`init` … `apply_claim_timestamps`)
exist **only in the database** — there are no SQL files for them in the repo, and two of them
(`apply_rpc_quote_fix`, `apply_claim_timestamps`) aren't even represented in `prisma/migrations/`.
Anyone rebuilding this DB from the repo cannot. Worth back-filling from a `pg_dump --schema-only`
at some point.

### Phase 3 — Close the reset-token hole ✅ **DONE 2026-09-29, live as `api` v5**
See the Phase 3 section above for the full record. Summary: the takeover hole (a working 30-minute
`resetToken` in the `forgot-password` body) was reproduced live, then closed by emailing the link and
failing closed with 503 while the transport env is unset. Verified live: no `resetToken` in
any response, known and unknown emails byte-identical, login/categories/health all 200.

### Phase 3b — Swap Resend for provider-agnostic SMTP ✅ **DONE 2026-09-30, live as `api` v6**
The original Phase 3 fix hard-coded the Resend REST API. Replaced with a dependency-free SMTP client
so any provider works (Gmail app password, Fastmail, Postmark, SES, Mailgun, a local relay):

- `_shared/smtp.ts` (new, 8679 bytes deployed) and `_shared/email.ts` (rewritten). `routers/auth.ts` is
  untouched — the exported `isEmailConfigured` / `buildResetLink` / `sendPasswordReset` signatures are
  unchanged. Env is read at call time via a local `readEnv()`, not the `_shared/env.ts` snapshot.
- `tests/helpers/fakeSmtp.ts` (new) — stateful fake relay stubbing `Deno.connect` / `connectTls` /
  `startTls`; `tests/smtp.test.ts` (new); `tests/forgotPassword.test.ts` (rewritten).
- Local: `deno check` clean, `deno lint` clean, `deno fmt` applied,
  **`deno test` → 21 passed (120 steps), 0 failed** excluding the known `mlImageWiring` flake.

**Two real bugs were found and fixed while writing these tests, not just test bugs:**

1. **`envelopeAddress()` had a CRLF-injection hole.** It extracted the angled address *first* and
   only then checked for line breaks, so a crafted value such as
   `a@b.test\r\nRCPT TO:<evil@attacker.test>` was silently "cleaned up" into the **attacker's**
   address instead of being rejected. The check now runs before parsing.
2. **The no-JWT assertion in `forgotPassword.test.ts` was vacuous.** It was written
   `assert(!"[a-zA-Z0-9_-]{20,}…".test(body))`, and `!"` parses as a **string literal**, so the
   whole `.test(body)` sat inside the string and the assertion could never fail. Rewritten to bind
   the pattern to a named const. Worth remembering: `!` followed by `"` is a string, not a regex.

**v6 deployment verified** (`ezbr_sha256=7eb5087e…`):

| Check | Result |
|---|---|
| Bundle file count | **42** = v5's 41 + `_shared/smtp.ts`; no `.env`, no `tests/`, no `deno.lock` |
| `resend` references in bundle | **0** (was 5 in v5's `email.ts`) |
| `email.ts` imports | `import { sendMail, type SmtpConfig } from "./smtp.ts";` |
| `verify_jwt` | still **`false`** — deploy was run *without* `--no-verify-jwt` so the remote setting persisted |
| `import_map_path` | `…/supabase/functions/api/deno.json` |
| `GET /health`, `GET /categories` | 200 / 200 |
| `POST /auth/forgot-password` × 2 | **503**, bodies byte-identical, no `resetToken`, no JWT |
| `POST /auth/reset-password` (no token) | 400 |

⚠️ **Password reset is still OFF, by design.** The 503 is the intended fail-closed behaviour and it
is what keeps the takeover hole closed — it is not a regression from v5. It stays 503 until the
SMTP secrets below are set. No `SMTP_*`, `MAIL_FROM` or `APP_URL` exists in the edge secrets yet;
current secrets are `ALLOWED_ORIGINS`, `CLOUDINARY_*` (3), `JWT_SECRET`, `SUPABASE_*` (6).

**To turn it on**, set these as edge secrets (see `.env.example` for the full contract):

| Secret | Required | Notes |
|---|---|---|
| `SMTP_HOST` | yes | e.g. `smtp.gmail.com`, `smtp.fastmail.com` |
| `MAIL_FROM` | yes | verified sender, e.g. `Lost & Found <no-reply@yourdomain.com>` |
| `APP_URL` | yes | `https://lost-found-client.vercel.app` — must match where the client is served |
| `SMTP_PORT` | no | defaults to 587 (STARTTLS); 465 = implicit TLS |
| `SMTP_USER` / `SMTP_PASS` | no | **both or neither** — one alone disables email; both empty = open trusted relay |
| `SMTP_SECURE` | no | inferred from port; set `true` to force implicit TLS |

Then re-probe `forgot-password` for a registered address: **200** with the generic body means live.

**✅ SMTP IS LIVE — Brevo, delivery confirmed 2026-10-02, `api` v10.** Secrets set:
`SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER` + `SMTP_PASS` (Brevo SMTP key),
`MAIL_FROM="Lost & Found <r21002774@gmail.com>"`, `APP_URL=https://lost-found-client.vercel.app`.

Live result: `forgot-password` returns **200** for a registered address, byte-identical to an
unregistered one — no `token`, no JWT, no enumeration. **Verified end to end by the owner on
2026-10-02:** reset email received, link opened, new password set, and login with that new password
succeeded. The emailed `?token=` link resolves correctly.

🐛 **A fourth real bug: a bad `MAIL_FROM` that every test could not catch.**
The sender was initially set to a *guessed* relay address
(`noreply@breevo-de98c6ffef5c0c21e5700a56.mailer.brevo.com`) because no verified sender had been
confirmed with the owner. Brevo's relay is permissive at the envelope stage: `MAIL FROM` returned
`250`, the body was accepted with a final `250`, `sendMail` resolved, and the endpoint returned the
generic `200` — so everything looked healthy and **no email was ever delivered**. It was dropped
after SMTP acceptance, most likely for want of an authenticated sending domain.

The detection rule that mattered: **absence of `[Email] reset delivery failed` proves Brevo accepted
the message, not that it was delivered.** Those are different claims. SMTP acceptance was confirmed
repeatedly while delivery was broken for a day.

Fixed by setting a verified sender (`r21002774@gmail.com`, `api` v10). Worth remembering when
touching SMTP config again: never invent a sender address, and check the Brevo *Transactional →
Email log* for a per-message verdict rather than trusting an HTTP 200.

⚠️ **Still open:** only the success path of `sendMail` is unobservable in our logs — a post-acceptance
drop logs nothing. Consider logging the final SMTP response code and Brevo's message-id (neither is
sensitive). This is why the above took ~20 tool calls to find.

🐛 **A third real bug, found only by probing the live relay — not by any test.**
`Deno.startTls(conn)` with no options derives the TLS servername from the socket's *peer IP*, so
certificate verification failed against a real server:

```
invalid peer certificate: certificate not valid for name "127.0.0.1";
certificate is only valid for DnsName("smtp-relay.brevo.com")
```

The fake server in `tests/helpers/fakeSmtp.ts` stubs `Deno.startTls` and never performs a handshake,
so **the whole suite passed while this bug was live**. Fixed by passing the hostname explicitly:

```ts
await Deno.startTls(conn, { hostname: this.#hostname });   // `hostname` is mandatory, not cosmetic
```

Note `StartTlsOptions` accepts `hostname` but **not** `port`. Regression-guarded by a new test that
asserts `startTls` receives the SMTP host, and re-probed against Brevo afterwards →
`AUTH PLAIN: 235 2.0.0 Authentication succeeded`.

**Lesson worth keeping: the unit tests could not have caught this.** Protocol correctness against a
real relay had to be verified against the real relay.

**Verification status — complete as far as possible without an inbox.** A reset was requested for
`rb6864941@gmail.com` at 2026-10-02 00:13 local → **200**, no token or JWT in the body. Combined with
the direct `AUTH PLAIN: 235` probe, that establishes Brevo accepted the credentials and the full
`MAIL`/`RCPT`/`DATA`/`QUIT` sequence returned success.

⚠️ **Real inbox delivery is UNVERIFIED.** The sender is Brevo's default `…mailer.brevo.com`, which
Gmail may treat as untrusted. A send failure is indistinguishable from success at the HTTP layer *by
design* (that is what prevents account enumeration), so the 200 does not prove delivery. **To confirm
later, when inbox access is available:** request a reset for a real address and check the inbox *and*
spam folder for "Reset your Lost & Found password" with a `…vercel.app/reset-password?token=…` link.
If it does not arrive, Brevo's transaction log holds the bounce reason — the one signal we cannot see
from here. Before sending at volume, move `MAIL_FROM` to a domain you own and authenticate it
(DKIM/SPF), or Gmail will increasingly filter it.

**Two housekeeping items left open, both requiring credentials that were pasted into this chat:**

1. **Rotate the Brevo SMTP key.** It is live in production and present in the transcript:
   `supabase secrets set --project-ref cuhngnehtlswsdemsdpr SMTP_PASS="<new key>"`
2. **Revoke the Supabase access token** pasted earlier in the session.


### Phase 3c — Close the unauthenticated public-database hole ✅ **DONE 2026-10-01, migration `enable_rls_deny_all`**
**This was far more severe than the reset-token hole and it was live the whole time.**

Found by running the Supabase security advisors (which had never been run since the Phase 2b DDL),
then **verified empirically instead of assumed**:

```
GET https://cuhngnehtlswsdemsdpr.supabase.co/rest/v1/User?limit=2
  apikey: sb_publishable_…          ← the PUBLIC key, public by design
→ 200 OK
  [{"id":"285b3552-…","name":"Pawan","email":"p@mail.com","phone":"",
    "passwordHash":"$2a$10$tslaqi8spA1.jN…", …]
```

RLS was **disabled on all 10 tables with zero policies**, and `has_table_privilege` confirmed `anon`
held **SELECT, INSERT, UPDATE and DELETE on every one**. Unauthenticated, with no secret, anyone could:

1. **Dump every user's bcrypt `passwordHash`** for offline cracking. Real user `p@mail.com` exposed.
2. **Escalate to admin in a single request** — `User.role` is a `UserRole` enum containing `ADMIN`, so
   `POST /rest/v1/User` with a self-chosen hash and `"role":"ADMIN"`, then log in via the app's own
   `/auth/login`. Full application takeover.
3. **Delete or falsify anything**, including the `AuditLog`.

**Why it went unnoticed:** the client never ships a Supabase key and never touches PostgREST — all
traffic goes through the edge function with the app's own JWT. Correct design, but irrelevant: a
publishable key is *public by design*, so nothing needed to be stolen.

**Fix — `supabase/migrations/20260930213000_enable_rls_deny_all.sql`:** enable RLS on all 10 tables
with **zero policies**. This application does no browser-side DB access and the edge function queries
with `SUPABASE_SERVICE_ROLE_KEY`, which has `BYPASSRLS` — so `anon`/`authenticated` are denied
completely while the app is untouched.

⚠️ **Do not "fix" this by adding permissive policies.** If a future feature needs direct browser DB
access, it needs policies deliberately scoped to the authenticated user id.

**Verified after applying:**

| Check | Before | After |
|---|---|---|
| `GET /rest/v1/User` as anon | 200 + `passwordHash` | 200 + `[]` (0 rows) |
| `GET /rest/v1/{Item,Report,Category}` as anon | 200 + rows | 200 + `[]` |
| `INSERT Category` as anon | succeeded | **401 `42501` violates row-level security policy** |
| `INSERT User(role=ADMIN)` as anon | succeeded | **401 `42501` violates row-level security policy** |
| `UPDATE Category cat-Electronics` as anon | succeeded | 204, 0 rows, `name` still `Electronics` |
| `DELETE Category` as anon | succeeded | 204, 0 rows |
| Probe rows persisted | — | **0** (`cat-RLS-PROBE`, `probe@evil.test`) |
| Tables with / without RLS | 0 / 10 | **10 / 0** |
| `GET /health` | 200 | 200 |
| `GET /categories` | 200 | 200, **9 rows**, real data (proves service_role path intact) |
| `POST /auth/login` bogus creds | 401 | 401 `Invalid credentials` (DB lookup still runs) |
| Advisor `rls_disabled_in_public` | **ERROR × 10** | **gone** |

The advisor now reports `rls_enabled_no_policy` at **INFO** × 10. That is the **intended** end state
for this architecture, not a finding to resolve.

⚠️ **Consequence: existing passwords should be treated as disclosed.** The hashes were readable
without authentication, so any weak or reused password behind them may already be cracked. Nothing
is exposed *now* that RLS is on, so this is hygiene rather than an active emergency.

The `User` table holds 3 accounts, **2 of which use real Gmail addresses** (see below), all `USER`
role, all with a password set. Resetting them is **deferred to the owner** — do not invalidate the
hashes automatically, because there is no admin-side "force reset" flag in the schema and clearing
`passwordHash` locks the account out until someone uses `forgot-password`, which now works.


### Phase 4 — Client route guards + 404 ✅ **DONE, verified in headless Chrome**
30 routes, all declared in one place, no 404 gap.

- New `client/src/components/RouteGuards.jsx` — `RequireAuth` + `RequireAdmin`. Both branch on
  `AuthContext.loading` first and render a spinner while it resolves; that is the whole trick, since
  a guard that ignores `loading` reads a signed-in user as logged out on refresh and bounces them.
- `client/src/App.jsx` — routes grouped public / public-browsing / static / signed-in / admin.
  Admin routes are `RequireAuth` **outside** `RequireAdmin`, so a logged-out visitor gets `/login`
  rather than being told "admin only" before we know who they are.
- Deleted the 6 ad-hoc `useEffect(() => !isAuthenticated && navigate('/login'))` redirects in
  `AdminDashboard`, `Dashboard`, `ClaimSubmit`, `ReportLost`, `ReportFound`, `ReportEdit`.
- New `client/src/pages/NotFound.jsx` + `<Route path="*" />`. `/home` kept as an alias to `/`.
- `Login` / `Register` now `<Navigate>` away when already authenticated; `Login` reads
  `location.state.from` (stashed by `RequireAuth`) so sign-in returns you to the page you wanted.
- These are **UX, not security**. Every private endpoint re-checks the JWT server-side.

**Verified in headless Chrome against the production bundle** (local stub API for `/auth/me`, since
writing test rows into the live database is not something to do casually):

| case | result |
|---|---|
| 11 private routes, logged out | all → `/login` |
| 5 `/admin/*`, logged out | all → `/login` |
| `/nonsense` | 404 |
| `/search`, `/found-feed`, `/about`, `/` logged out | render (public) |
| `/admin/*` as **USER** | → `/` (blocked) |
| `/admin/*` as **ADMIN** | render |
| `/dashboard`, `/matches`, `/profile`, `/claims/new` as USER | render |
| `localStorage` role tampered to ADMIN, server says USER | blocked — **server response wins** |

That last row is the security-relevant one: `AuthContext.verifyToken()` overwrites the cached user
with `/auth/me`, so a hand-edited `localStorage` cannot grant admin.

🐛 **A silent-comment bug worth remembering.** The first `/admin` render 404'd, and the production
build showed *none* of the 5 admin routes while the file on disk plainly had them. Cause: a JSX
comment whose `*/` was missing —
`{/* Admins only - ... not "/}` — so the block comment ran on and swallowed the 5 routes, ending at
the `*/` of the *next* comment. `/home` survived only because it sat below the terminator.

Two things made this slow to see, both worth checking first next time:
1. **`npm run build` succeeded.** JSX comments are just comments; nothing errors, the routes are
   silently gone. Bundle went 363 kB → 392 kB only after the fix.
2. **Vite dev served the same broken module**, so it was not a stale-cache red herring I chased first.
   Fastest confirmation was counting route paths in the *built bundle* rather than the DOM:
   `Select-String 'path: "/admin' dist/assets/index-*.js` → 0.

**⚠️ Pre-existing repo problem found while testing: `client/.env.local` has no `VITE_API_URL`.**
It contains only a `VERCEL_OIDC_TOKEN` (written by the Vercel CLI). So `import.meta.env.VITE_API_URL`
is `undefined`, `axios` `baseURL` is `undefined`, and a local build issues **relative** requests.
Two consequences: (a) `npm run build` output is not deployable as-is — it only works because Vercel
supplies the var; (b) in dev, a 401/SPA-fallback returns `index.html` with 200, so `verifyToken()`
happily stores an HTML string as the user and `isAdmin` silently reads `undefined`. Worth adding the
var to `.env.local` and, separately, having `AuthContext` sanity-check the `/auth/me` payload rather
than trusting any 2xx. `status.md` had claimed `.env.local` "points at the deployed edge function" —
it does not.

### Phase 5 — Docs, deploy, verify
Docs went last, so the README was written once against the final state.

### Phase 5 — Docs, deploy, verify ✅ **DONE**
Docs went last, so the README was written once against the final state.

- **`README.md` rewritten** from 333 lines of retired-stack documentation to the real architecture.
  Every claim was re-derived from source before writing: Oak/Deno not Express, Edge Function not a
  port-5000 server, no `prisma migrate dev`, the real 12-field matching weights (the old table
  claimed a 5-field 25/25/20/20/10 split — wrong), real route prefixes, real secrets table, and the
  deny-all RLS rationale. Both documented commands were executed to confirm they work.
- Deleted `MIGRATION_COMPLETE_PLAN.md` + `DOCS_DEMO_CREDS.md`. Before deleting, the only
  uncommitted edit in the former — a note about the Vercel Root Directory failure — was carried into
  this file (see the warning below), so nothing was lost.
- Edge secrets: SMTP block set in Phase 3b. `ALLOWED_ORIGINS` was already set and verified working:
  `https://lost-found-client.vercel.app` and `http://localhost:5173` both return
  `Access-Control-Allow-Origin`, while `https://evil.example.com` gets **no** header.
- **Deployed 2026-10-02, both halves.** Committed as 5 commits on `master` (`7c98ea1` SMTP,
  `48ecb86` RLS, `df24d22` Location drop, `1331952` route guards, `b9bc66b` docs) and pushed.
  - `api` is live as **v9**, `ACTIVE`, `verify_jwt=false`. Deployed with an explicit
    `--no-verify-jwt`: there is no `verify_jwt` key in `supabase/config.toml`, so relying on the
    CLI default risks flipping gateway verification back to `true`, which would break every
    request because the app uses its own `JWT_SECRET` rather than a Supabase JWT.
  - The client is **live**, not just pushed. Verified the deployed bundle rather than trusting the
    deploy: `https://lost-found-client.vercel.app/assets/index-DM8lTXg8.js` contains the new 404
    page copy and all four `/admin/*` paths. The admin paths are the real proof — before the
    unterminated-JSX-comment fix, `App.jsx` had no admin routes at all, so they could not have been
    in the bundle. No stub URL is baked in.
  - Live checks against the deployed function: `/health` 200 · `/categories` 200 with 9 rows (proves
    the service-role path survives deny-all RLS) · `GET /auth/me` with no token → 401 ·
    `forgot-password` for a known and an unknown email both → byte-identical 200 · CRLF in the email
    field → 400. Database re-confirmed: 10/10 tables `relrowsecurity`, 0 policies.
- `deno check` clean · `deno test` **21 passed (121 steps)** excluding the known `mlImageWiring`
  flake · `npm run build` clean (1449 modules).
- Full verification: `deno check` · `deno test` (64 steps) · integration flow (86 checks) against the
  deployed function · `npm run build` · prod smoke: register → report lost → report found →
  auto-match → claim → handover → RETURNED.

> ⚠️ **Vercel Root Directory must stay `client`, or builds fail in a way that looks fine.**
> (Root cause found + fixed 2026-09-25; rescued from the now-deleted `MIGRATION_COMPLETE_PLAN.md`.)
> With Root Directory unset the build runs at the **repo root**, installs the old `server/`
> dependencies including Prisma, then dies with `BUILD_UTILS_SPAWN_1` /
> `npm error Missing script: "build"`. The trap: the production URL keeps serving the **previous**
> manually-deployed bundle, so the site stays up and *looks* deployed while your commit is nowhere
> in it — which is how the forgot/reset pages went missing despite "green" deployments elsewhere.
> Fixed with `PATCH /v9/projects/lost-found-client {"rootDirectory":"client"}`
> (project `prj_WRBw19mPdYSGkGFcGGVa5QfSQQ41`, team `pawan-a6f7`). **Whenever you think a client change
> didn't reach production, check this before debugging your own code.**

---

## 4. Known minor rot (not worth a phase)

- **Dangling provenance comments.** Six comments now reference deleted files:
  `supabase/functions/api/_shared/cloudinary.ts:5` and `image.ts:7` ("Mirrors `server/src/...`"),
  plus three in `prisma/migrations/20260924130000_supabase_rpc_functions/migration.sql:3-5`.
  Harmless, but a reader grepping for them finds nothing — the code now lives at
  `legacy-express-final`. The `/uploads/a.jpg` strings in `tests/matchingEngine.test.ts:298,300` are
  just fixture values, not paths.
- `client/` audit count changed while Phase 5 was being written, so the old "4 advisories, only
  `--force` available" note is **stale**: it is now **5 (2 high, 3 moderate)**. The new high one is
  **axios ≤ 1.19.0** (prototype-pollution gadgets, redirect SSRF via unenforced `maxRedirects: 0`).
  Unlike the other two, it has a **non-breaking fix**: `npm audit fix` takes `1.19.0 → 1.20.0`
  inside the declared `^1.6.2`. Verified via `npm audit fix --dry-run`. The moderates
  (react-router 6, esbuild) still require `--force` → `react-router-dom@7` / `vite@8`, both major,
  so those stay deferred. **Recommended next action: run plain `npm audit fix` in `client/`.**

## 5. Deliberately skipped (revisit only on hitting the ceiling)

- Migrating auth to Supabase Auth — touches every route's middleware for no gain once real email exists.
- Docker / local Supabase stack — declined; 5 GB install and RAM pressure on an 8 GB box.
- Splitting the 707-line integration flow — it works.
- Realtime notifications — currently polling; no user-visible defect.

---

## 6. Fresh-session guide

Paste this at the start of a new session:

> Working on `P:\lost` (Lost & Found: React SPA + Supabase Edge Function in Deno/Oak + Postgres).
> **Read `P:\lost\status.md` first** — it has current state, environment gotchas, and remaining phases.
> Phases 0, 1, 2a are committed and pushed. Phases 2b and 3 are live but uncommitted.
> Do NOT use `npx prisma` — use `./node_modules/.bin/prisma`.
> Do NOT use `prisma migrate deploy` — this repo's schema history lives in
> `supabase_migrations.schema_migrations`, not `_prisma_migrations`. Use MCP `apply_migration`.
> The Supabase CLI **is** installed and authed; edge secrets now work via
> `supabase secrets set --project-ref cuhngnehtlswsdemsdpr`.
> `api` is on **v5** with `verify_jwt: false` — do not "fix" that with `--no-verify-jwt`.

Then orient with:

```bash
cd /p/lost
git status --short          # expect the Phase 2b + Phase 3 set listed in the Working tree section
git log --oneline -3
deno --version              # 2.9.7 via winget, on PATH
./node_modules/.bin/prisma --version
curl -s -o /dev/null -w "%{http_code}\n" --max-time 20 \
  https://cuhngnehtlswsdemsdpr.supabase.co/functions/v1/api/health   # expect 200
```

⚠️ When probing any other route, use the client's real URL shape —
`…/functions/v1/api/auth/forgot-password`, **not** `…/functions/v1/api/api/…`. The doubled form 404s and
reads like an outage.

**Before changing anything**, re-establish the safety net:
```bash
cd /p/lost/supabase/functions/api
deno test --config ../deno.json --allow-env --allow-net --ignore=tests/mlImageWiring.test.ts tests/
# expect: ok | 18 passed (96 steps) | 0 failed
# (drop --ignore to run everything; mlImageWiring.test.ts has a known timing flake)
```

### Rollback for the Phase 2a delete
⚠️ **The `legacy-express-final` tag does not exist.** Earlier revisions of this file claimed it did;
it was never created. The `server/` + `uploads/` files are still recoverable from commit `dd016a2`
(=` df69cbb~1`), so use that instead:
```bash
git show dd016a2:server/src/app.js          # recover one file
git checkout dd016a2 -- server uploads      # restore the tree only, no history rewrite
```
Do **not** `git reset --hard` to that commit — it would discard Phase 2b and any newer work.
