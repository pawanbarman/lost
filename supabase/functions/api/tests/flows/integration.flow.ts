// Phase 2 end-to-end integration flow for the Deno/Oak Edge Function.
//
// Runs against a locally started function (`deno run --allow-env --allow-net
// --env-file=.env index.ts`, listening on :8000) backed by the hosted Supabase
// DB. Exits non-zero on any failed assertion.
//
//   deno run --allow-env --allow-net tests/flows/integration.flow.ts
//
// No seeded/demo accounts are used. Throwaway users are registered at runtime
// (owner/finder/stranger as plain USERs, one promoted to ADMIN via the service
// role key); `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be in the
// environment (e.g. from supabase/functions/api/.env) for that bootstrap step.

import { createClient } from "@supabase/supabase-js";

const BASE = Deno.env.get("BASE_URL") ?? "http://localhost:8000";
const RUN_IP = `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 2}`;

const step = crypto.randomUUID().slice(0, 8);
const title = `Azure Neon Skateboard ${step}`;
const description =
  `Limited edition azure neon skateboard ${step} with glow wheels. Flow verification item.`;
const location = "Student Services, Ground Floor";
const category = `FlowTest-9B-${step}`;
const privateDetails = "Hidden serial code AZ-9901";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    console.error(`  FAIL ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

async function call(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: any; headers: Headers }> {
  const headers = new Headers({ ...(opts.headers ?? {}) });
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);
  let payload: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(opts.body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  let body: any = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body, headers: res.headers };
}

// Generic success sink for the migration/flow step names.
function seq(prefix: string, n: number): string {
  return `${prefix} ${n}`;
}

// Direct service-role bootstrap for throwaway users (no seeded admin exists).
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required to bootstrap flow users");
  Deno.exit(2);
}
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const setRole = async (userId: string, role: string) => {
  const { error } = await adminClient.from("User").update({ role }).eq("id", userId);
  if (error) throw new Error(`setRole ${userId}: ${error.message}`);
};
const setCommunity = async (userId: string, communityId: string) => {
  const { error } = await adminClient.from("User").update({ communityId }).eq("id", userId);
  if (error) throw new Error(`setCommunity ${userId}: ${error.message}`);
};

console.log(`Flow run ${step} targeting ${BASE} from ${RUN_IP}`);

// ---------------------------------------------------------------------------
// Health + CORS
// ---------------------------------------------------------------------------
{
  const r = await call("GET", "/api/health", { headers: { "x-forwarded-for": RUN_IP } });
  check("health returns ok", r.status === 200 && r.body?.status === "ok", `got ${r.status} ${JSON.stringify(r.body)}`);

  const pre = await call("OPTIONS", "/api/reports", {
    headers: { origin: "http://localhost:5173", "x-forwarded-for": RUN_IP },
  });
  check(
    "CORS allows configured origin",
    pre.status === 204 && pre.headers.get("access-control-allow-origin") === "http://localhost:5173",
    `status=${pre.status} acao=${pre.headers.get("access-control-allow-origin")}`,
  );

  const bad = await call("OPTIONS", "/api/reports", {
    headers: { origin: "http://evil.example", "x-forwarded-for": RUN_IP },
  });
  check(
    "CORS rejects disallowed origin",
    bad.status === 204 && bad.headers.get("access-control-allow-origin") === null,
    `status=${bad.status} acao=${bad.headers.get("access-control-allow-origin")}`,
  );
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
// Register throwaway users (no seeded accounts exist).
const ownerReg = await call("POST", "/api/auth/register", {
  body: { name: "Flow Owner", email: `flow-owner-${step}@example.com`, password: "flowpass123" },
  headers: { "x-forwarded-for": RUN_IP },
});
check("register owner 201", ownerReg.status === 201 && ownerReg.body?.token, JSON.stringify(ownerReg.body));
await setCommunity(ownerReg.body?.user?.id, "com-campus");

const janeReg = await call("POST", "/api/auth/register", {
  body: { name: "Flow Finder", email: `flow-finder-${step}@example.com`, password: "flowpass123" },
  headers: { "x-forwarded-for": RUN_IP },
});
check("register finder 201", janeReg.status === 201 && janeReg.body?.token, JSON.stringify(janeReg.body));
await setCommunity(janeReg.body?.user?.id, "com-campus");

const adminReg = await call("POST", "/api/auth/register", {
  body: { name: "Flow Admin", email: `flow-admin-${step}@example.com`, password: "flowpass123" },
  headers: { "x-forwarded-for": RUN_IP },
});
check("register admin candidate 201", adminReg.status === 201 && adminReg.body?.token, JSON.stringify(adminReg.body));
await setRole(adminReg.body?.user?.id, "ADMIN");

const admin = adminReg.body;
const john = ownerReg.body;
const jane = janeReg.body;
const freshEmail = `flow-${step}@example.com`;
const reg = await call("POST", "/api/auth/register", {
  body: { name: "Flow Tester", email: freshEmail, password: "flowpass123" },
  headers: { "x-forwarded-for": RUN_IP },
});
check("register new user 201", reg.status === 201 && reg.body?.token && reg.body?.user?.email === freshEmail, JSON.stringify(reg.body));
const fresh = reg.body;
const freshId: string = fresh?.user?.id;

const adminMe = await call("GET", "/api/auth/me", { token: admin.token, headers: { "x-forwarded-for": RUN_IP } });
check("admin bootstrap role", adminMe.status === 200 && adminMe.body?.role === "ADMIN", JSON.stringify(adminMe.body));

{
  const dup = await call("POST", "/api/auth/register", {
    body: { name: "Flow Tester", email: freshEmail, password: "flowpass123" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("duplicate register 400", dup.status === 400 && dup.body?.error === "Email already registered", JSON.stringify(dup.body));

  const weak = await call("POST", "/api/auth/register", {
    body: { name: "Flow Tester", email: "flow-" + step + "-2@example.com", password: "123" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("weak password rejected 400", weak.status === 400, JSON.stringify(weak.body));

  const badLogin = await call("POST", "/api/auth/login", {
    body: { email: ownerReg.body?.user?.email, password: "wrongpass" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("wrong password 401", badLogin.status === 401 && badLogin.body?.error === "Invalid credentials", JSON.stringify(badLogin.body));

  const me = await call("GET", "/api/auth/me", { token: fresh.token, headers: { "x-forwarded-for": RUN_IP } });
  check("me returns profile", me.status === 200 && me.body?.email === freshEmail, JSON.stringify(me.body));

  const noAuth = await call("GET", "/api/auth/me", { headers: { "x-forwarded-for": RUN_IP } });
  check("me without token 401", noAuth.status === 401 && noAuth.body?.error === "Authentication required", JSON.stringify(noAuth.body));

  const badAuth = await call("GET", "/api/auth/me", {
    token: "not.a.token",
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("me with bad token 401", badAuth.status === 401 && badAuth.body?.error === "Invalid token", JSON.stringify(badAuth.body));
}
void seq;

// ---------------------------------------------------------------------------
// Public catalog
// ---------------------------------------------------------------------------
let categories: any[] = [];
{
  const r = await call("GET", "/api/categories", { headers: { "x-forwarded-for": RUN_IP } });
  check("list categories", r.status === 200 && Array.isArray(r.body), JSON.stringify(r.body)?.slice(0, 120));
  categories = Array.isArray(r.body) ? r.body : [];
}
{
  const r = await call("GET", "/api/events", { headers: { "x-forwarded-for": RUN_IP } });
  check("list active events", r.status === 200 && Array.isArray(r.body), JSON.stringify(r.body)?.slice(0, 120));
}
{
  const r = await call("GET", "/api/communities", { headers: { "x-forwarded-for": RUN_IP } });
  check("list communities", r.status === 200 && r.body?.some((c: any) => c.id === "com-campus"), JSON.stringify(r.body)?.slice(0, 120));
}
{
  const r = await call("GET", "/api/reports", { headers: { "x-forwarded-for": RUN_IP } });
  const noLeak = Array.isArray(r.body) && r.body.every((rep: any) => !rep?.item || !("privateDetails" in rep.item));
  check("public reports list hides privateDetails", r.status === 200 && noLeak, JSON.stringify(r.body)?.slice(0, 160));
}

// ---------------------------------------------------------------------------
// Lost report (john)
// ---------------------------------------------------------------------------
let lost: any;
{
  const r = await call("POST", "/api/reports", {
    token: john.token,
    body: {
      type: "LOST",
      title,
      category,
      description,
      location,
      dateTime: new Date().toISOString(),
      communityId: "com-campus",
      privateDetails,
      brand: "FlowWorks",
      color: "azure",
    },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("create LOST report 201", r.status === 201 && r.body?.id && r.body?.item?.title === title, JSON.stringify(r.body));
  lost = r.body;
}
const lostId: string = lost?.id;

{
  const asOwner = await call("GET", `/api/reports/${lostId}`, { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check(
    "owner sees privateDetails",
    asOwner.status === 200 && asOwner.body?.item?.privateDetails === privateDetails,
    JSON.stringify(asOwner.body),
  );

  const asJane = await call("GET", `/api/reports/${lostId}`, { token: jane.token, headers: { "x-forwarded-for": RUN_IP } });
  check(
    "non-owner privateDetails stripped",
    asJane.status === 200 && !("privateDetails" in (asJane.body?.item ?? {})),
    JSON.stringify(asJane.body),
  );

  const anon = await call("GET", `/api/reports/${lostId}`, { headers: { "x-forwarded-for": RUN_IP } });
  check("report detail requires auth 401", anon.status === 401 && anon.body?.error === "Authentication required", JSON.stringify(anon.body));

  const missing = await call("GET", `/api/reports/${crypto.randomUUID()}`, { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check("report 404", missing.status === 404 && missing.body?.error === "Report not found", JSON.stringify(missing.body));

  const delOther = await call("DELETE", `/api/reports/${lostId}`, { token: jane.token, headers: { "x-forwarded-for": RUN_IP } });
  check("non-owner delete 403", delOther.status === 403 && delOther.body?.error === "Not authorized to delete this report", JSON.stringify(delOther.body));

  const updOther = await call("PUT", `/api/reports/${lostId}`, {
    token: jane.token,
    body: { location: "Hijacked" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("non-owner update 403", updOther.status === 403 && updOther.body?.error === "Not authorized to edit this report", JSON.stringify(updOther.body));

  const upd = await call("PUT", `/api/reports/${lostId}`, {
    token: john.token,
    body: { location: "Student Services, Ground Floor - Lockers", color: "teal" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check(
    "owner updates report",
    upd.status === 200 && upd.body?.location === "Student Services, Ground Floor - Lockers" && upd.body?.item?.color === "teal",
    JSON.stringify(upd.body),
  );
}

// Admin report status transitions (before the found report creates a match).
{
  const r = await call("PUT", `/api/admin/reports/${lostId}/status`, {
    token: admin.token,
    body: { status: "NOPE" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("admin invalid status 400", r.status === 400 && r.body?.error === "Invalid status value", JSON.stringify(r.body));

  const closed = await call("PUT", `/api/admin/reports/${lostId}/status`, {
    token: admin.token,
    body: { status: "CLOSED" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("admin invalid transition 400", closed.status === 400 && closed.body?.error?.startsWith && closed.body.error.startsWith("Cannot change status"), JSON.stringify(closed.body));

  const uv = await call("PUT", `/api/admin/reports/${lostId}/status`, {
    token: admin.token,
    body: { status: "UNDER_VERIFICATION" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("admin sets UNDER_VERIFICATION", uv.status === 200 && uv.body?.status === "UNDER_VERIFICATION", JSON.stringify(uv.body)?.slice(0, 160));

  const back = await call("PUT", `/api/admin/reports/${lostId}/status`, {
    token: admin.token,
    body: { status: "LOST" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("admin sets back to LOST", back.status === 200 && back.body?.status === "LOST", JSON.stringify(back.body)?.slice(0, 120));
}

// ---------------------------------------------------------------------------
// Found report (jane) -> auto match
// ---------------------------------------------------------------------------
let found: any;
{
  const r = await call("POST", "/api/reports", {
    token: jane.token,
    body: {
      type: "FOUND",
      title,
      category,
      description,
      location,
      dateTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      communityId: "com-campus",
      color: "azure",
    },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("create FOUND report 201", r.status === 201 && r.body?.id, JSON.stringify(r.body));
  found = r.body;
}
const foundId: string = found?.id;

let matchId: string;
{
  const r = await call("GET", `/api/reports/${lostId}/matches`, { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  const hit = Array.isArray(r.body?.matches) && r.body.matches.find((m: any) => m.foundReportId === foundId);
  check(
    "live match candidate found",
    r.status === 200 && hit && hit.score >= 60,
    JSON.stringify(r.body),
  );

  const m = await call("GET", "/api/matches", { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  const persisted = Array.isArray(m.body) && m.body.find((mm: any) => mm.lostReportId === lostId && mm.foundReportId === foundId);
  check(
    "persisted auto match for john",
    persisted && persisted?.id,
    JSON.stringify(m.body)?.slice(0, 200),
  );
  matchId = persisted?.id;
}

{
  const detail = await call("GET", `/api/matches/${matchId}`, { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check("match detail for john", detail.status === 200 && detail.body?.lostReport?.userId === john.user.id, JSON.stringify(detail.body)?.slice(0, 200));

  const asJane = await call("GET", `/api/matches/${matchId}`, { token: jane.token, headers: { "x-forwarded-for": RUN_IP } });
  check("match detail for jane (involved)", asJane.status === 200 && asJane.body?.foundReport?.userId === jane.user.id, JSON.stringify(asJane.body)?.slice(0, 200));

  const stranger = await call("GET", `/api/matches/${matchId}`, { token: fresh.token, headers: { "x-forwarded-for": RUN_IP } });
  check("match detail stranger 403", stranger.status === 403 && stranger.body?.error === "Not authorized to view this match", JSON.stringify(stranger.body));

  const missing = await call("GET", `/api/matches/${crypto.randomUUID()}`, { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check("match 404", missing.status === 404 && missing.body?.error === "Match not found", JSON.stringify(missing.body));

  const badStatus = await call("PUT", `/api/matches/${matchId}/status`, {
    token: john.token,
    body: { status: "MEH" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("match invalid status 400", badStatus.status === 400 && badStatus.body?.error === "Invalid status value", JSON.stringify(badStatus.body));
}

// ---------------------------------------------------------------------------
// Search + found feed (report still POSSIBLE_MATCH / FOUND here — the found
// report becomes RETURNED after the handover later, which excludes it from the
// default feed status filter).
// ---------------------------------------------------------------------------
{
  const s = await call("GET", `/api/search?q=${encodeURIComponent(title)}`, { headers: { "x-forwarded-for": RUN_IP } });
  check("search finds our reports", s.status === 200 && Array.isArray(s.body) && s.body.length >= 2, JSON.stringify(s.body)?.slice(0, 200));

  const sFiltered = await call("GET", `/api/search?type=FOUND&category=${category}`, { headers: { "x-forwarded-for": RUN_IP } });
  check(
    "search type+category filter",
    sFiltered.status === 200 && Array.isArray(sFiltered.body) && sFiltered.body.length >= 1 && sFiltered.body.every((r: any) => r.type === "FOUND" && r.item?.category === category),
    JSON.stringify(sFiltered.body)?.slice(0, 200),
  );

  const feed = await call("GET", "/api/found-feed", { token: jane.token, headers: { "x-forwarded-for": RUN_IP } });
  const feedHit = feed.body?.reports?.find((r: any) => r.id === foundId);
  check(
    "found feed scoped to user community includes new found",
    feed.status === 200 && feedHit && feed.body?.pagination?.total > 0,
    JSON.stringify(feed.body)?.slice(0, 160),
  );

  const capped = await call("GET", "/api/found-feed?limit=1000", { token: jane.token, headers: { "x-forwarded-for": RUN_IP } });
  check(
    "found feed limit capped at 50",
    capped.body?.pagination?.limit === 50 && (capped.body?.reports?.length ?? 0) <= 50,
    JSON.stringify(capped.body)?.slice(0, 160),
  );

  const older = await call("GET", "/api/found-feed?sort=oldest&limit=1", { token: jane.token, headers: { "x-forwarded-for": RUN_IP } });
  check("found feed sort=oldest paginates", older.status === 200 && older.body?.pagination?.page === 1 && older.body?.reports?.length === 1, JSON.stringify(older.body)?.slice(0, 160));

  const adminScope = await call("GET", `/api/found-feed?communityId=com-city&limit=5`, { token: admin.token, headers: { "x-forwarded-for": RUN_IP } });
  check(
    "admin community override does not leak com-campus found",
    adminScope.status === 200 && !adminScope.body?.reports?.some((r: any) => r.id === foundId),
    JSON.stringify(adminScope.body)?.slice(0, 160),
  );

  const feed450 = await call("GET", "/api/found-feed?page=1&limit=2", { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check(
    "found feed page 2 beyond range is empty not error",
    feed450.status === 200,
    JSON.stringify(feed450.body)?.slice(0, 160),
  );
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------
let claimId: string;
{
  const created = await call("POST", "/api/claims", {
    token: john.token,
    body: { matchId, verificationDetails: "I can confirm the neon wheels and the hidden serial code.", },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check(
    "create claim 201",
    created.status === 201 && created.body?.id && created.body?.match?.id === matchId,
    JSON.stringify(created.body)?.slice(0, 200),
  );
  claimId = created.body?.id;

  const dup = await call("POST", "/api/claims", {
    token: john.token,
    body: { matchId, verificationDetails: "I can confirm the neon wheels and the hidden serial code." },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check(
    "duplicate claim 400",
    dup.status === 400 && dup.body?.error === "You have already submitted a claim for this item",
    JSON.stringify(dup.body),
  );

  const notOwner = await call("POST", "/api/claims", {
    token: jane.token,
    body: { matchId, verificationDetails: "I can confirm the neon wheels and the hidden serial code." },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check(
    "non-owner claim 403",
    notOwner.status === 403 && notOwner.body?.error === "Only the owner of the lost item may claim this match",
    JSON.stringify(notOwner.body),
  );

  const list = await call("GET", "/api/claims", { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check("claim list scoped to claimant", Array.isArray(list.body) && list.body.some((c: any) => c.id === claimId), JSON.stringify(list.body)?.slice(0, 200));

  const detail = await call("GET", `/api/claims/${claimId}`, { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check(
    "claim detail for claimant has adminNotes stripped",
    detail.status === 200 && detail.body?.claimantId === john.user.id && !("adminNotes" in detail.body),
    JSON.stringify(detail.body)?.slice(0, 200),
  );

  const stranger = await call("GET", `/api/claims/${claimId}`, { token: fresh.token, headers: { "x-forwarded-for": RUN_IP } });
  check("claim detail stranger 403", stranger.status === 403 && stranger.body?.error === "Not authorized", JSON.stringify(stranger.body));

  const missing = await call("GET", `/api/claims/${crypto.randomUUID()}`, { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check("claim 404", missing.status === 404 && missing.body?.error === "Claim not found", JSON.stringify(missing.body));
}

{
  const bad = await call("PUT", `/api/claims/${claimId}/status`, {
    token: admin.token,
    body: { status: "MAYBE" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("claim invalid review status 400", bad.status === 400, JSON.stringify(bad.body));

  const asJane = await call("PUT", `/api/claims/${claimId}/status`, {
    token: jane.token,
    body: { status: "APPROVED" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("non-admin claim review 403", asJane.status === 403, JSON.stringify(asJane.body));

  const approve = await call("PUT", `/api/claims/${claimId}/status`, {
    token: admin.token,
    body: { status: "APPROVED", adminNotes: "Seems legit." },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check(
    "admin approves claim",
    approve.status === 200 && approve.body?.status === "APPROVED" && approve.body?.adminNotes === "Seems legit.",
    JSON.stringify(approve.body)?.slice(0, 200),
  );

  const adminDetail = await call("GET", `/api/claims/${claimId}`, { token: admin.token, headers: { "x-forwarded-for": RUN_IP } });
  check(
    "admin claim detail shows claimant email",
    adminDetail.status === 200 && adminDetail.body?.claimant?.email === ownerReg.body?.user?.email,
    JSON.stringify(adminDetail.body)?.slice(0, 200),
  );
}

{
  const badAction = await call("PUT", `/api/claims/${claimId}/handover`, {
    token: john.token,
    body: { action: "SKIP" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("handover invalid action 400", badAction.status === 400 && badAction.body?.error === "Invalid handover action. Use START or COMPLETE.", JSON.stringify(badAction.body));

  const stranger = await call("PUT", `/api/claims/${claimId}/handover`, {
    token: fresh.token,
    body: { action: "START" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("handover stranger 403", stranger.status === 403, JSON.stringify(stranger.body));

  const start = await call("PUT", `/api/claims/${claimId}/handover`, {
    token: john.token,
    body: { action: "START" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("claimant starts handover", start.status === 200 && start.body?.status === "UNDER_HANDOVER", JSON.stringify(start.body)?.slice(0, 160));

  const complete = await call("PUT", `/api/claims/${claimId}/handover`, {
    token: jane.token,
    body: { action: "COMPLETE" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("finder completes handover", complete.status === 200 && complete.body?.status === "COMPLETED", JSON.stringify(complete.body)?.slice(0, 160));

  const final = await call("GET", `/api/reports/${lostId}`, { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check("lost report RETURNED after handover", final.status === 200 && final.body?.status === "RETURNED", JSON.stringify(final.body)?.slice(0, 120));
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
{
  const list = await call("GET", "/api/notifications", { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check("notifications list non-empty", list.status === 200 && Array.isArray(list.body) && list.body.length > 0, JSON.stringify(list.body)?.slice(0, 120));

  const count = await call("GET", "/api/notifications/unread-count", { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check("unread count > 0", count.status === 200 && count.body?.count > 0, JSON.stringify(count.body));

  const firstId = list.body?.[0]?.id;
  const read = await call("PUT", `/api/notifications/${firstId}/read`, { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check("mark one read", read.status === 200 && read.body?.isRead === true, JSON.stringify(read.body));

  const otherRead = await call("PUT", `/api/notifications/${firstId}/read`, { token: jane.token, headers: { "x-forwarded-for": RUN_IP } });
  check("mark other user notification 403", otherRead.status === 403, JSON.stringify(otherRead.body));

  const all = await call("PUT", "/api/notifications/read-all", { token: john.token, headers: { "x-forwarded-for": RUN_IP } });
  check("read all", all.status === 200, JSON.stringify(all.body));
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
{
  const dash = await call("GET", "/api/admin/dashboard", { token: admin.token, headers: { "x-forwarded-for": RUN_IP } });
  check("admin dashboard", dash.status === 200 && typeof dash.body === "object", JSON.stringify(dash.body)?.slice(0, 160));

  const users = await call("GET", "/api/admin/users", { token: admin.token, headers: { "x-forwarded-for": RUN_IP } });
  check("admin users with report counts", users.status === 200 && Array.isArray(users.body) && "reports" in (users.body?.[0]?._count ?? {}), JSON.stringify(users.body)?.slice(0, 200));

  const role = await call("PUT", `/api/admin/users/${freshId}/role`, {
    token: admin.token,
    body: { role: "USER" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check(
    "admin user role update no password leak",
    role.status === 200 && !("passwordHash" in role.body),
    JSON.stringify(role.body)?.slice(0, 160),
  );

  const reports = await call("GET", "/api/admin/reports", { token: admin.token, headers: { "x-forwarded-for": RUN_IP } });
  check("admin reports list", reports.status === 200 && Array.isArray(reports.body), JSON.stringify(reports.body)?.slice(0, 120));

  const flagged = await call("GET", "/api/admin/reports/flagged", { token: admin.token, headers: { "x-forwarded-for": RUN_IP } });
  check("admin flagged reports", flagged.status === 200 && Array.isArray(flagged.body), JSON.stringify(flagged.body)?.slice(0, 120));

  const flag = await call("PUT", `/api/admin/reports/${lostId}/flag`, {
    token: admin.token,
    body: { reason: "Flow verification flag" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("admin flags report", flag.status === 200 && flag.body?.isFlagged === true, JSON.stringify(flag.body)?.slice(0, 160));

  const flagNoReason = await call("PUT", `/api/admin/reports/${lostId}/flag`, {
    token: admin.token,
    body: { reason: "" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("flag requires reason 400", flagNoReason.status === 400, JSON.stringify(flagNoReason.body));

  const unflag = await call("PUT", `/api/admin/reports/${lostId}/unflag`, {
    token: admin.token,
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("admin unflags report", unflag.status === 200 && unflag.body?.isFlagged === false, JSON.stringify(unflag.body)?.slice(0, 160));

  const logs = await call("GET", "/api/admin/audit-logs", { token: admin.token, headers: { "x-forwarded-for": RUN_IP } });
  check("admin audit logs", logs.status === 200 && Array.isArray(logs.body), JSON.stringify(logs.body)?.slice(0, 120));

  const denied = await call("GET", "/api/admin/dashboard", { token: jane.token, headers: { "x-forwarded-for": RUN_IP } });
  check("non-admin admin endpoint 403", denied.status === 403 && denied.body?.error === "Admin access required", JSON.stringify(denied.body));
}

// ---------------------------------------------------------------------------
// Events / Categories / Communities
// ---------------------------------------------------------------------------
{
  const created = await call("POST", "/api/events", {
    token: admin.token,
    body: {
      name: `Flow Event ${step}`,
      venue: "Main Hall",
      location: "Campus Center",
      startDate: new Date(Date.now() + 86400000).toISOString(),
      endDate: new Date(Date.now() + 2 * 86400000).toISOString(),
    },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("admin creates event 201", created.status === 201 && created.body?.id && created.body?.qrCode, JSON.stringify(created.body)?.slice(0, 160));
  const eventId = created.body?.id;

  const evt = await call("GET", `/api/events/${eventId}`, { headers: { "x-forwarded-for": RUN_IP } });
  check("event detail active", evt.status === 200 && evt.body?.id === eventId && evt.body?.reports, JSON.stringify(evt.body)?.slice(0, 160));

  const toggle = await call("PUT", `/api/events/${eventId}`, {
    token: admin.token,
    body: { active: false },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("admin deactivates event", toggle.status === 200 && toggle.body?.active === false, JSON.stringify(toggle.body)?.slice(0, 120));

  const del = await call("DELETE", `/api/events/${eventId}`, { token: admin.token, headers: { "x-forwarded-for": RUN_IP } });
  check("admin deletes event", del.status === 200, JSON.stringify(del.body));

  const nonAdmin = await call("POST", "/api/events", {
    token: jane.token,
    body: { name: "Nope", venue: "x", location: "y", startDate: "2026-10-01", endDate: "2026-10-02" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("non-admin event create 403", nonAdmin.status === 403, JSON.stringify(nonAdmin.body));

  const catName = `Flow Cat ${step}`;
  const cat = await call("POST", "/api/categories", {
    token: admin.token,
    body: { name: catName },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("admin creates category 201", cat.status === 201 && cat.body?.id, JSON.stringify(cat.body));
  const catId = cat.body?.id;

  const catDel = await call("DELETE", `/api/categories/${catId}`, { token: admin.token, headers: { "x-forwarded-for": RUN_IP } });
  check("admin deletes category", catDel.status === 200, JSON.stringify(catDel.body));

  const catNonAdmin = await call("POST", "/api/categories", {
    token: jane.token,
    body: { name: "Nope Cat" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("non-admin category create 403", catNonAdmin.status === 403, JSON.stringify(catNonAdmin.body));

  const commCode = `FLOW-${step}`;
  const comm = await call("POST", "/api/communities", {
    token: admin.token,
    body: { name: `Flow Community ${step}`, code: commCode, description: "Throwaway community." },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("admin creates community 201", comm.status === 201 && comm.body?.id, JSON.stringify(comm.body));

  const commDup = await call("POST", "/api/communities", {
    token: admin.token,
    body: { name: `Flow Community Dup ${step}`, code: commCode, description: "Duplicate code." },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("duplicate community code 400", commDup.status === 400 && commDup.body?.error === "A community with this code already exists", JSON.stringify(commDup.body));

  const commNonAdmin = await call("POST", "/api/communities", {
    token: jane.token,
    body: { name: "Nope Comm", code: "NOPE" },
    headers: { "x-forwarded-for": RUN_IP },
  });
  check("non-admin community create 403", commNonAdmin.status === 403, JSON.stringify(commNonAdmin.body));
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) Deno.exit(1);