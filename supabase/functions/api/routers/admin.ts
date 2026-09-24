import { Router, type Context } from "oak";
import { db } from "../_shared/db.ts";
import { readJson } from "../_shared/body.ts";
import { authenticate, requireAdmin } from "../_shared/auth.ts";
import { rpcCall } from "../_shared/rpc.ts";
import { ITEM_FULL, REPORT_COLUMNS, USER_WITH_EMAIL } from "../_shared/selectors.ts";

interface UserWithReportCounts {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  _count: { reports: number };
}

const router = new Router({ prefix: "/api/admin" });

const VALID_REPORT_STATUSES = [
  "LOST",
  "FOUND",
  "POSSIBLE_MATCH",
  "UNDER_VERIFICATION",
  "CLAIMED",
  "RETURNED",
  "CLOSED",
];

const ADMIN_REPORT_DETAIL =
  `${REPORT_COLUMNS},item:Item(${ITEM_FULL}),user:User(${USER_WITH_EMAIL})`;

async function getAdminReports(ctx: Context, flagged: boolean) {
  const params = ctx.request.url.searchParams;
  const type = params.get("type");
  const status = params.get("status");

  let query = db().from("Report").select(ADMIN_REPORT_DETAIL);

  if (flagged) {
    query = query.eq("isFlagged", true).order("updatedAt", { ascending: false });
  } else {
    query = query.order("createdAt", { ascending: false });
  }
  if (type) query = query.eq("type", type);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;

  ctx.response.body = data;
}

router.get("/dashboard", authenticate, requireAdmin, async (ctx) => {
  const stats = await rpcCall<Record<string, unknown>>("dashboard_stats", {});
  ctx.response.body = stats;
});

router.get("/reports", authenticate, requireAdmin, (ctx) => getAdminReports(ctx, false));

router.get("/reports/flagged", authenticate, requireAdmin, (ctx) => getAdminReports(ctx, true));

router.put("/reports/:id/status", authenticate, requireAdmin, async (ctx) => {
  const user = ctx.state.user!;
  const { status } = await readJson<Record<string, unknown>>(ctx);

  if (typeof status !== "string" || !VALID_REPORT_STATUSES.includes(status)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid status value" };
    return;
  }

  const { data: existing, error: findError } = await db()
    .from("Report")
    .select("id,userId,status")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (findError) throw findError;

  if (!existing) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Report not found" };
    return;
  }

  const invalidTransitions: Record<string, string[]> = {
    CLOSED: ["LOST", "FOUND", "POSSIBLE_MATCH", "UNDER_VERIFICATION", "CLAIMED"],
    RETURNED: ["LOST", "FOUND", "POSSIBLE_MATCH"],
  };

  if (invalidTransitions[status]?.includes(existing.status)) {
    ctx.response.status = 400;
    ctx.response.body = {
      error: `Cannot change status from ${existing.status} to ${status}`,
    };
    return;
  }

  const { data: report, error } = await db()
    .from("Report")
    .update({ status, updatedAt: new Date().toISOString() })
    .eq("id", existing.id)
    .select(ADMIN_REPORT_DETAIL)
    .single();
  if (error) throw error;

  const audit = await db()
    .from("AuditLog")
    .insert({
      id: crypto.randomUUID(),
      userId: user.id,
      action: "UPDATE_STATUS",
      entityType: "REPORT",
      entityId: report.id,
      details: `Changed status to ${status}`,
    });
  if (audit.error) throw audit.error;

  const notification = await db()
    .from("Notification")
    .insert({
      id: crypto.randomUUID(),
      userId: report.userId,
      message: `Your report status has been updated to ${status}`,
      type: "REPORT_UPDATED",
    });
  if (notification.error) throw notification.error;

  ctx.response.body = report;
});

router.put("/reports/:id/flag", authenticate, requireAdmin, async (ctx) => {
  const user = ctx.state.user!;
  const { reason } = await readJson<Record<string, unknown>>(ctx);

  if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
    ctx.response.status = 400;
    ctx.response.body = { error: "A reason is required to flag a report" };
    return;
  }

  const { data: report, error } = await db()
    .from("Report")
    .update({
      isFlagged: true,
      flaggedReason: reason.trim(),
      updatedAt: new Date().toISOString(),
    })
    .eq("id", ctx.params.id)
    .select(ADMIN_REPORT_DETAIL);
  if (error) throw error;

  if (!report || report.length === 0) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Report not found" };
    return;
  }

  const audit = await db()
    .from("AuditLog")
    .insert({
      id: crypto.randomUUID(),
      userId: user.id,
      action: "FLAG_REPORT",
      entityType: "REPORT",
      entityId: report[0].id,
      details: `Flagged report with reason: ${reason.trim()}`,
    });
  if (audit.error) throw audit.error;

  ctx.response.body = report[0];
});

router.put("/reports/:id/unflag", authenticate, requireAdmin, async (ctx) => {
  const user = ctx.state.user!;

  const { data: reports, error } = await db()
    .from("Report")
    .update({
      isFlagged: false,
      flaggedReason: null,
      updatedAt: new Date().toISOString(),
    })
    .eq("id", ctx.params.id)
    .select("*");
  if (error) throw error;

  if (!reports || reports.length === 0) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Report not found" };
    return;
  }

  const audit = await db()
    .from("AuditLog")
    .insert({
      id: crypto.randomUUID(),
      userId: user.id,
      action: "UNFLAG_REPORT",
      entityType: "REPORT",
      entityId: reports[0].id,
      details: "Cleared flag on report",
    });
  if (audit.error) throw audit.error;

  ctx.response.body = reports[0];
});

router.get("/users", authenticate, requireAdmin, async (ctx) => {
  const users = await rpcCall<UserWithReportCounts[]>("users_with_report_counts", {});
  ctx.response.body = users;
});

router.put("/users/:id/role", authenticate, requireAdmin, async (ctx) => {
  const { role } = await readJson<Record<string, unknown>>(ctx);

  const { data: users, error } = await db()
    .from("User")
    .update({ role, updatedAt: new Date().toISOString() })
    .eq("id", ctx.params.id)
    .select("id,name,email,phone,communityId,role,createdAt,updatedAt");
  if (error) throw error;

  if (!users || users.length === 0) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Record not found" };
    return;
  }

  ctx.response.body = users[0];
});

router.get("/audit-logs", authenticate, requireAdmin, async (ctx) => {
  const { data, error } = await db()
    .from("AuditLog")
    .select(`*,user:User(${USER_WITH_EMAIL})`)
    .order("createdAt", { ascending: false })
    .limit(100);
  if (error) throw error;

  ctx.response.body = data;
});

export default router;