-- Deny-all Row Level Security on every public table.
--
-- WHY: RLS was disabled on all 10 tables with zero policies, so the `anon` role
-- held SELECT/INSERT/UPDATE/DELETE on everything. Because the Supabase
-- publishable key is public by design, anyone could read every user's bcrypt
-- passwordHash, INSERT a User with role='ADMIN' and log straight in as admin,
-- or delete the data and the AuditLog. Verified live before this migration:
--   GET /rest/v1/User?limit=2 with the publishable key -> 200 with passwordHash.
--
-- WHY NO POLICIES: this application does no browser-side database access. The
-- React client holds no Supabase key and never talks to PostgREST; every read
-- and write goes through the `api` edge function, which authenticates with the
-- app's own JWT and then queries using SUPABASE_SERVICE_ROLE_KEY. service_role
-- has BYPASSRLS, so enabling RLS with zero policies denies anon/authenticated
-- completely while leaving the application untouched.
--
-- Do NOT add permissive policies to "fix" client access here. If a future
-- feature needs direct browser database access, that needs its own policies
-- scoped to the authenticated user id, written deliberately.

alter table public."User"         enable row level security;
alter table public."Item"         enable row level security;
alter table public."Report"       enable row level security;
alter table public."Match"        enable row level security;
alter table public."Notification" enable row level security;
alter table public."AuditLog"     enable row level security;
alter table public."Claim"        enable row level security;
alter table public."Category"     enable row level security;
alter table public."Community"    enable row level security;
alter table public."Event"        enable row level security;

-- Force the change to apply to pooled/reused sessions too.
notify pgrst, 'reload schema';
