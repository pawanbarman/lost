import type { Middleware } from "oak";

// Port of express-rate-limit's default: 100 requests / 15 minutes per IP.
// In-memory windowed limiter — correct for a single worker, best-effort under multiple
// isolates. This is the lightweight option in the plan; a Postgres-backed variant is the
// optional hardening step.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 100;

const buckets = new Map<string, number[]>();

function clientIp(ctx: { request: { headers: Headers; ip?: string } }): string {
  const forwarded = ctx.request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return ctx.request.ip ?? "unknown";
}

export function rateLimit(): Middleware {
  return async (ctx, next) => {
    const ip = clientIp(ctx);
    const now = Date.now();

    const hits = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);

    if (hits.length >= MAX_REQUESTS) {
      ctx.response.status = 429;
      ctx.response.body = { error: "Too many requests, please try again later." };
      return;
    }

    hits.push(now);
    buckets.set(ip, hits);
    await next();
  };
}