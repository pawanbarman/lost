import { Router, type Context } from "oak";
import { db } from "../_shared/db.ts";
import { readFields } from "../_shared/request.ts";
import { handleImage } from "../_shared/image.ts";
import { validate } from "../_shared/validate.ts";
import { authenticate } from "../_shared/auth.ts";
import {
  FULL_REPORT_SELECT,
  fullReportSelect,
  ITEM_FULL,
  MY_REPORTS_SELECT,
  ITEM_PUBLIC,
  REPORT_COLUMNS,
  USER_NARROW,
  sanitizeReportForViewer,
} from "../_shared/selectors.ts";
import { likePattern, orLikePattern } from "../_shared/filters.ts";
import { reportSchema, updateReportSchema } from "../validators/report.ts";
import { findEligibleCandidates, rankMatches } from "../matching/aiMatchingService.ts";
import { matchingService } from "../matching/matchingService.ts";
import { mlImageSimilarityProvider } from "../matching/mlImageProvider.ts";

const router = new Router({ prefix: "/api/reports" });

const REPORTS_LIST_SELECT =
  `${REPORT_COLUMNS},item:Item(${ITEM_PUBLIC}),community:Community(*),event:Event(*),user:User(${USER_NARROW})`;

router.get("/my", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const { data, error } = await db()
    .from("Report")
    .select(MY_REPORTS_SELECT)
    .eq("userId", user.id)
    .order("createdAt", { ascending: false });
  if (error) throw error;

  ctx.response.body = data;
});

router.get("/:id/matches", authenticate, async (ctx) => {
  const user = ctx.state.user!;

  const { data: report, error } = await db()
    .from("Report")
    .select(`*,item:Item(${ITEM_FULL})`)
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;

  if (!report) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Report not found" };
    return;
  }

  if (report.userId !== user.id && user.role !== "ADMIN") {
    ctx.response.status = 403;
    ctx.response.body = { error: "Not authorized to view matches for this report" };
    return;
  }

  const candidates = await findEligibleCandidates(report as never);
  // Same provider as the automatic matching path so the preview and the real
  // run agree on image evidence.
  const ranked = await rankMatches(report as never, candidates, {
    limit: 10,
    imageSimilarity: mlImageSimilarityProvider,
  });

  const matches = ranked.matches.map((match) => {
    const candidate = match.report as unknown as Record<string, unknown>;
    const item = candidate.item as Record<string, unknown> | undefined;
    if (item?.privateDetails) {
      delete item.privateDetails;
    }
    return {
      lostReportId: match.lostReportId,
      foundReportId: match.foundReportId,
      score: Math.round(match.score * 100),
      confidence: match.confidence,
      evidence: match.evidence,
      summary: match.summary,
      report: candidate,
    };
  });

  ctx.response.body = { reportId: report.id, type: report.type, matches };
});

router.post("/", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const { fields, file } = await readFields(ctx);
  const validatedData = validate(reportSchema, fields);

  const imageUrl = await handleImage(file, user);

  const now = new Date().toISOString();
  const itemId = crypto.randomUUID();

  const { data: item, error: itemError } = await db()
    .from("Item")
    .insert({
      id: itemId,
      title: validatedData.title,
      category: validatedData.category,
      description: validatedData.description,
      imageUrl,
      privateDetails: validatedData.privateDetails ?? null,
      currentLocation: validatedData.currentLocation ?? null,
      color: validatedData.color ?? null,
      brand: validatedData.brand ?? null,
      model: validatedData.model ?? null,
      uniqueFeatures: validatedData.uniqueFeatures ?? null,
      condition: validatedData.condition ?? null,
      size: validatedData.size ?? null,
      updatedAt: now,
    })
    .select("*")
    .single();
  if (itemError) throw itemError;

  const { data: report, error } = await db()
    .from("Report")
    .insert({
      id: crypto.randomUUID(),
      userId: user.id,
      itemId: item.id,
      type: validatedData.type,
      location: validatedData.location,
      dateTime: new Date(validatedData.dateTime).toISOString(),
      eventId: validatedData.eventId ?? null,
      communityId: validatedData.communityId || user.communityId || null,
      status: validatedData.type === "LOST" ? "LOST" : "FOUND",
      updatedAt: now,
    })
    .select(FULL_REPORT_SELECT)
    .single();
  if (error) throw error;

  await matchingService.findMatches(report.id);

  ctx.response.status = 201;
  ctx.response.body = report;
});

router.get("/", async (ctx) => {
  const { type, status, category, location, communityId, search } = qp(ctx);

  let query = db()
    .from("Report")
    .select(REPORTS_LIST_SELECT)
    .order("createdAt", { ascending: false });

  if (type) query = query.eq("type", type);
  if (status) query = query.eq("status", status);
  if (communityId) query = query.eq("communityId", communityId);
  if (location) query = query.ilike("location", likePattern(location));

  // Category lives on Item; a dotted embed predicate would only null the embed
  // instead of filtering (PostgREST left-join semantics), so resolve Item ids
  // first and filter on itemId.
  if (category) {
    const { data: items, error: itemError } = await db()
      .from("Item")
      .select("id")
      .eq("category", category);
    if (itemError) throw itemError;
    const ids = (items ?? []).map((item) => item.id as string);
    if (ids.length === 0) {
      ctx.response.body = [];
      return;
    }
    query = query.in("itemId", ids);
  }

  if (search) {
    query = query.or(
      `item.title.ilike.${orLikePattern(search)},item.description.ilike.${orLikePattern(search)},location.ilike.${orLikePattern(search)}`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  ctx.response.body = data;
});

router.get("/:id", authenticate, async (ctx) => {
  const user = ctx.state.user!;

  const { data: report, error } = await db()
    .from("Report")
    // Cast back to the literal so .select() still infers the row shape; the helper returns a
    // widened string, which would otherwise degrade `report` to GenericStringError.
    .select(fullReportSelect(user.role) as typeof FULL_REPORT_SELECT)
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;

  if (!report) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Report not found" };
    return;
  }

  ctx.response.body = sanitizeReportForViewer(report as Record<string, unknown>, user);
});

router.put("/:id", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const { fields, file } = await readFields(ctx);
  const validatedData = validate(updateReportSchema, fields);

  const { data: report, error: findError } = await db()
    .from("Report")
    .select("id,userId,itemId")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (findError) throw findError;

  if (!report) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Report not found" };
    return;
  }

  if (report.userId !== user.id && user.role !== "ADMIN") {
    ctx.response.status = 403;
    ctx.response.body = { error: "Not authorized to edit this report" };
    return;
  }

  const imageUrl = file ? await handleImage(file, user) : undefined;

  const now = new Date().toISOString();
  const reportUpdate: Record<string, unknown> = {};
  if (validatedData.location !== undefined) reportUpdate.location = validatedData.location;
  if (validatedData.dateTime !== undefined) {
    reportUpdate.dateTime = new Date(validatedData.dateTime).toISOString();
  }
  if (validatedData.communityId !== undefined) {
    reportUpdate.communityId = validatedData.communityId || null;
  }

  let updatedReport: Record<string, unknown> | null = null;
  if (Object.keys(reportUpdate).length > 0) {
    const { error } = await db()
      .from("Report")
      .update({ ...reportUpdate, updatedAt: now })
      .eq("id", report.id);
    if (error) throw error;
  } else {
    const { data, error } = await db()
      .from("Report")
      .select(`*,item:Item(${ITEM_FULL}),community:Community(*)`)
      .eq("id", report.id)
      .single();
    if (error) throw error;
    updatedReport = data as Record<string, unknown>;
  }

  const itemUpdate: Record<string, unknown> = {};
  if (validatedData.title) itemUpdate.title = validatedData.title;
  if (validatedData.category) itemUpdate.category = validatedData.category;
  if (validatedData.description) itemUpdate.description = validatedData.description;
  if (validatedData.privateDetails !== undefined) {
    itemUpdate.privateDetails = validatedData.privateDetails || null;
  }
  if (validatedData.currentLocation !== undefined) {
    itemUpdate.currentLocation = validatedData.currentLocation || null;
  }
  if (validatedData.color !== undefined) itemUpdate.color = validatedData.color || null;
  if (validatedData.brand !== undefined) itemUpdate.brand = validatedData.brand || null;
  if (validatedData.model !== undefined) itemUpdate.model = validatedData.model || null;
  if (validatedData.uniqueFeatures !== undefined) {
    itemUpdate.uniqueFeatures = validatedData.uniqueFeatures || null;
  }
  if (validatedData.condition !== undefined) itemUpdate.condition = validatedData.condition || null;
  if (validatedData.size !== undefined) itemUpdate.size = validatedData.size || null;
  if (imageUrl !== undefined) itemUpdate.imageUrl = imageUrl;

  if (Object.keys(itemUpdate).length > 0) {
    const { error } = await db()
      .from("Item")
      .update({ ...itemUpdate, updatedAt: now })
      .eq("id", report.itemId);
    if (error) throw error;
  }

  const { data: fresh, error: freshError } = await db()
    .from("Report")
    .select(`*,item:Item(${ITEM_FULL}),community:Community(*)`)
    .eq("id", report.id)
    .single();
  if (freshError) throw freshError;

  ctx.response.body = fresh;
});

router.delete("/:id", authenticate, async (ctx) => {
  const user = ctx.state.user!;

  const { data: report, error: findError } = await db()
    .from("Report")
    .select("id,userId")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (findError) throw findError;

  if (!report) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Report not found" };
    return;
  }

  if (report.userId !== user.id && user.role !== "ADMIN") {
    ctx.response.status = 403;
    ctx.response.body = { error: "Not authorized to delete this report" };
    return;
  }

  const { error } = await db().from("Report").delete().eq("id", report.id);
  if (error) throw error;

  ctx.response.body = { message: "Report deleted successfully" };
});

function qp(ctx: Context): Record<string, string> {
  const params = ctx.request.url.searchParams;
  const out: Record<string, string> = {};
  for (const key of [...params.keys()].filter((k) => params.get(k) !== null)) {
    out[key] = params.get(key) as string;
  }
  return out;
}

export default router;