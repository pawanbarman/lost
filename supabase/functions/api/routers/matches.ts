import { Router } from "oak";
import { db } from "../_shared/db.ts";
import { readJson } from "../_shared/body.ts";
import { authenticate } from "../_shared/auth.ts";
import { MATCH_DETAIL_SELECT, sanitizeMatchForViewer } from "../_shared/selectors.ts";
import { matchingService } from "../matching/matchingService.ts";

const router = new Router({ prefix: "/api/matches" });

const VALID_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"];

router.get("/", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  ctx.response.body = await matchingService.getMatchesForUser(user.id);
});

router.get("/:id", authenticate, async (ctx) => {
  const user = ctx.state.user!;

  const { data: match, error } = await db()
    .from("Match")
    .select(MATCH_DETAIL_SELECT)
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;

  if (!match) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Match not found" };
    return;
  }

  const isInvolved =
    match.lostReport.userId === user.id || match.foundReport.userId === user.id;
  if (!isInvolved && user.role !== "ADMIN") {
    ctx.response.status = 403;
    ctx.response.body = { error: "Not authorized to view this match" };
    return;
  }

  ctx.response.body = sanitizeMatchForViewer(match as Record<string, unknown>, user);
});

router.put("/:id/status", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const { status } = await readJson<Record<string, unknown>>(ctx);

  if (typeof status !== "string" || !VALID_STATUSES.includes(status)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid status value" };
    return;
  }

  const { data: match, error: findError } = await db()
    .from("Match")
    .select(MATCH_DETAIL_SELECT)
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (findError) throw findError;

  if (!match) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Match not found" };
    return;
  }

  if (
    match.lostReport.userId !== user.id &&
    match.foundReport.userId !== user.id &&
    user.role !== "ADMIN"
  ) {
    ctx.response.status = 403;
    ctx.response.body = { error: "Not authorized to update this match" };
    return;
  }

  const { data: updated, error } = await db()
    .from("Match")
    .update({ status })
    .eq("id", ctx.params.id)
    .select(MATCH_DETAIL_SELECT)
    .single();
  if (error) throw error;

  ctx.response.body = updated;
});

export default router;