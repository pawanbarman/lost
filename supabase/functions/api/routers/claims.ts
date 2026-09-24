import { Router } from "oak";
import { db } from "../_shared/db.ts";
import { readJson } from "../_shared/body.ts";
import { validate } from "../_shared/validate.ts";
import { authenticate, requireAdmin } from "../_shared/auth.ts";
import { rpcCall } from "../_shared/rpc.ts";
import { claimSelect, sanitizeClaimForViewer } from "../_shared/selectors.ts";
import { claimSchema } from "../validators/claim.ts";

const router = new Router({ prefix: "/api/claims" });

const HANDOVER_ACTIONS = ["START", "COMPLETE"];

interface HandoverClaim {
  id: string;
  claimantId: string;
  match: { lostReportId: string; foundReport: { userId: string } };
}

async function fetchClaim(
  id: string,
  role: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await db()
    .from("Claim")
    .select(claimSelect(role))
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as unknown as Record<string, unknown> | null;
}

router.post("/", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const validatedData = validate(claimSchema, await readJson<unknown>(ctx));

  const result = await rpcCall<{ claim_id: string }>("create_claim", {
    p_match_id: validatedData.matchId,
    p_claimant_id: user.id,
    p_verification_details: validatedData.verificationDetails,
  });

  const claim = await fetchClaim(result.claim_id, user.role);

  const response = user.role === "ADMIN" ? claim : sanitizeClaimForViewer(claim, user);
  ctx.response.status = 201;
  ctx.response.body = response;
});

router.get("/", authenticate, async (ctx) => {
  const user = ctx.state.user!;

  let query = db()
    .from("Claim")
    .select(claimSelect(user.role))
    .order("createdAt", { ascending: false });

  if (user.role !== "ADMIN") {
    query = query.eq("claimantId", user.id);
  }

  const { data, error } = await query;
  if (error) throw error;

  const claims = (data ?? []) as unknown as Record<string, unknown>[];
  ctx.response.body =
    user.role === "ADMIN"
      ? claims
      : claims.map((claim) => sanitizeClaimForViewer(claim, user));
});

router.get("/:id", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const claim = await fetchClaim(ctx.params.id, user.role);

  if (!claim) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Claim not found" };
    return;
  }

  if (claim.claimantId !== user.id && user.role !== "ADMIN") {
    ctx.response.status = 403;
    ctx.response.body = { error: "Not authorized" };
    return;
  }

  ctx.response.body =
    user.role === "ADMIN" ? claim : sanitizeClaimForViewer(claim, user);
});

router.put("/:id/status", authenticate, requireAdmin, async (ctx) => {
  const user = ctx.state.user!;
  const { status, adminNotes } = await readJson<Record<string, unknown>>(ctx);
  const normalized = String(status ?? "").toUpperCase();

  if (normalized !== "APPROVED" && normalized !== "REJECTED") {
    ctx.response.status = 400;
    ctx.response.body = {
      error:
        "Invalid status. Use APPROVED or REJECTED to review a claim. Handover steps use /handover.",
    };
    return;
  }

  if (normalized === "APPROVED") {
    await rpcCall("approve_claim", {
      p_claim_id: ctx.params.id,
      p_admin_notes: adminNotes ?? null,
    });
  } else {
    await rpcCall("reject_claim", {
      p_claim_id: ctx.params.id,
      p_admin_notes: adminNotes ?? null,
    });
  }

  ctx.response.body = await fetchClaim(ctx.params.id, user.role);
});

router.put("/:id/handover", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const body = await readJson<Record<string, unknown>>(ctx);
  const action = String(body.action ?? "").toUpperCase();

  if (!HANDOVER_ACTIONS.includes(action)) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Invalid handover action. Use START or COMPLETE." };
    return;
  }

  const findResult = await db()
    .from("Claim")
    .select("id,claimantId,match:Match(id,lostReportId,foundReport:Report!Match_foundReportId_fkey(userId))")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (findResult.error) throw findResult.error;
  const claim = (findResult.data ?? null) as unknown as HandoverClaim | null;

  if (!claim) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Claim not found" };
    return;
  }

  const isAdminUser = user.role === "ADMIN";
  const isClaimant = claim.claimantId === user.id;
  const isFinder = claim.match.foundReport.userId === user.id;

  if (!isAdminUser && !isClaimant && !isFinder) {
    ctx.response.status = 403;
    ctx.response.body = { error: "You are not authorized to manage this handover" };
    return;
  }

  if (action === "START") {
    await rpcCall("start_handover", { p_claim_id: ctx.params.id });
  } else {
    await rpcCall("complete_handover", { p_claim_id: ctx.params.id });
  }

  const updated = await fetchClaim(ctx.params.id, user.role);
  ctx.response.body =
    user.role === "ADMIN" ? updated : sanitizeClaimForViewer(updated, user);
});

export default router;