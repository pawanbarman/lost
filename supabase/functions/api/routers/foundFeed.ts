import { Router } from "oak";
import { db } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth.ts";
import { MATCH_FOUND_FEED } from "../_shared/selectors.ts";
import { likePattern, orLikePattern } from "../_shared/filters.ts";

const router = new Router({ prefix: "/api/found-feed" });

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parsePositiveInt(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return parsed;
}

interface Filters {
  q?: string;
  category?: string;
  color?: string;
  brand?: string;
  location?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  communityId?: string | null;
}

async function runFeed(
  filters: Filters,
  page: number,
  limit: number,
  sort: string | null,
): Promise<{ reports: unknown[]; total: number }> {
  const client = db();

  // The `or()` logical-operator syntax on this PostgREST does not accept
  // dotted refers to embedded resources, so item-level text search runs as a
  // separate Item query and the Report query unions the matching item ids with
  // a location match using plain Report columns only.
  let qItemIds: string[] | null = null;
  if (filters.q) {
    const p = orLikePattern(filters.q);
    const { data, error } = await client
      .from("Item")
      .select("id")
      .or(
        `title.ilike.${p},category.ilike.${p},color.ilike.${p},brand.ilike.${p},model.ilike.${p},uniqueFeatures.ilike.${p}`,
      );
    if (error) throw error;
    qItemIds = (data ?? []).map((item) => item.id as string);
  }

  // Structured Item filters (category/color/brand) are ANDed across Item
  // columns here rather than as dotted embed predicates for the same reason as
  // the q lookahead: embedded filters soft-match (null the embed) instead of
  // filtering parents on this PostgREST.
  const itemFiltered = filters.category !== undefined || filters.color !== undefined || filters.brand !== undefined;
  let filterItemIds: string[] | null = null;
  if (itemFiltered) {
    let b = client.from("Item").select("id");
    if (filters.category) b = b.eq("category", filters.category);
    if (filters.color) b = b.ilike("color", likePattern(filters.color));
    if (filters.brand) b = b.ilike("brand", likePattern(filters.brand));
    const { data, error } = await b;
    if (error) throw error;
    filterItemIds = (data ?? []).map((item) => item.id as string);
  }

  if (itemFiltered && filterItemIds !== null && filterItemIds.length === 0) {
    return { reports: [], total: 0 };
  }

  const applyCommon = (builder: any): any => {
    let b = builder.eq("type", "FOUND");

    if (filters.status) {
      b = b.eq("status", filters.status);
    } else {
      b = b.not("status", "in", "(CLAIMED,RETURNED,CLOSED)");
    }

    if (filters.communityId) {
      b = b.eq("communityId", filters.communityId);
    }

    if (filterItemIds !== null) {
      b = b.in("itemId", filterItemIds);
    }

    if (filters.location) {
      b = b.ilike("location", likePattern(filters.location));
    }

    if (filters.q) {
      const p = orLikePattern(filters.q);
      if (qItemIds && qItemIds.length > 0) {
        b = b.or(`itemId.in.(${qItemIds.join(",")}),location.ilike.${p}`);
      } else {
        b = b.ilike("location", likePattern(filters.q));
      }
    }

    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      if (!Number.isNaN(from.getTime())) {
        b = b.gte("dateTime", from.toISOString());
      }
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      if (!Number.isNaN(to.getTime())) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)) {
          to.setHours(23, 59, 59, 999);
        }
        b = b.lte("dateTime", to.toISOString());
      }
    }

    return b;
  };

  const countQuery = applyCommon(
    client.from("Report").select("id", { count: "exact", head: true }),
  );
  const dataQuery = applyCommon(client.from("Report").select(MATCH_FOUND_FEED));

  const from = (page - 1) * limit;
  const orderedDataQuery = dataQuery
    .order("dateTime", { ascending: sort === "oldest" })
    .range(from, from + limit - 1);

  const [{ count }, { data, error }] = await Promise.all([countQuery, orderedDataQuery]);
  if (error) throw error;

  return { reports: data ?? [], total: count ?? 0 };
}

router.get("/", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const params = ctx.request.url.searchParams;

  const page = parsePositiveInt(params.get("page"), 1);
  const limit = Math.min(parsePositiveInt(params.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
  const sort = params.get("sort");

  const adminCommunity = user.role === "ADMIN" ? params.get("communityId") : null;

  const filters: Filters = {
    q: params.get("q") ?? undefined,
    category: params.get("category") ?? undefined,
    color: params.get("color") ?? undefined,
    brand: params.get("brand") ?? undefined,
    location: params.get("location") ?? undefined,
    dateFrom: params.get("dateFrom") ?? undefined,
    dateTo: params.get("dateTo") ?? undefined,
    status: params.get("status") ?? undefined,
    communityId: adminCommunity ?? user.communityId,
  };

  const { reports, total } = await runFeed(filters, page, limit, sort);

  ctx.response.body = {
    reports,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
});

export default router;