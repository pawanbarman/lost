import { Router } from "oak";
import { db } from "../_shared/db.ts";
import { ITEM_PUBLIC, REPORT_COLUMNS, USER_NARROW } from "../_shared/selectors.ts";
import { likePattern, orLikePattern } from "../_shared/filters.ts";

const router = new Router({ prefix: "/api/search" });

const SEARCH_SELECT =
  `${REPORT_COLUMNS},item:Item(${ITEM_PUBLIC}),event:Event(*),user:User(${USER_NARROW})`;

router.get("/", async (ctx) => {
  const params = ctx.request.url.searchParams;
  const q = params.get("q");
  const type = params.get("type");
  const category = params.get("category");
  const location = params.get("location");
  const startDate = params.get("startDate");
  const endDate = params.get("endDate");
  const status = params.get("status");
  const sort = params.get("sort");

  let orderColumn = "createdAt";
  let ascending = false;

  if (sort === "oldest") {
    orderColumn = "createdAt";
    ascending = true;
  } else if (sort === "date_desc") {
    orderColumn = "dateTime";
    ascending = false;
  } else if (sort === "date_asc") {
    orderColumn = "dateTime";
    ascending = true;
  }

  let query = db()
    .from("Report")
    .select(SEARCH_SELECT)
    .order(orderColumn, { ascending })
    .limit(50);

  if (q && typeof q === "string") {
    // Item-level text search as its own query; the Report query then unions the
    // matching item ids with a location match (plain Report columns only, since
    // this PostgREST rejects dotted refers inside the or() logic tree).
    const p = orLikePattern(q);
    const { data: items, error: itemError } = await db()
      .from("Item")
      .select("id")
      .or(`title.ilike.${p},description.ilike.${p}`);
    if (itemError) throw itemError;

    const itemIds = (items ?? []).map((item) => item.id as string);
    if (itemIds.length > 0) {
      query = query.or(`itemId.in.(${itemIds.join(",")}),location.ilike.${p}`);
    } else {
      query = query.ilike("location", likePattern(q));
    }
  }

  if (type) query = query.eq("type", type);
  if (status) query = query.eq("status", status);

  // Filters on Item columns cannot go through a dotted embed predicate: this
  // PostgREST treats them as LEFT-JOIN conditions (non-matching parents are
  // returned with a null embed), so resolve the Item ids first and filter the
  // Report query on itemId instead.
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
  if (location) query = query.ilike("location", likePattern(location));

  if (startDate) {
    const from = new Date(startDate);
    if (!Number.isNaN(from.getTime())) query = query.gte("dateTime", from.toISOString());
  }
  if (endDate) {
    const to = new Date(endDate);
    if (!Number.isNaN(to.getTime())) query = query.lte("dateTime", to.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;

  ctx.response.body = data;
});

export default router;