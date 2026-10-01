import type { Middleware } from "oak";

// Port of express-rate-limit's default: 100 requests / 15 minutes per IP.
// In-memory windowed limiter — correct for a single worker, best-effort under multiple
// isolates. This is the lightweight option in the plan; a Postgres-backed variant is the
// optional hardening step.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 100;

// Chat-specific budgets (per IP) for reads; sends are throttled per user inside the router.
const CHAT_READ_WINDOW_MS = 15 * 60 * 1000;
const CHAT_READ_MAX_REQUESTS = 300;

const buckets = new Map<string, number[]>();
const chatReadBuckets = new Map<string, number[]>();

function clientIp(ctx: { request: { headers: Headers; ip?: string } }): string {
  const forwarded = ctx.request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return ctx.request.ip ?? "unknown";
}

function isChatReadPath(path: string): boolean {
  return path.startsWith("/api/conversations") && path.includes("/messages")
    ? true
    : path === "/api/conversations"
    ? true
    : path === "/api/conversations/unread-count"
    ? true
    : false;
}

export function rateLimit(): Middleware {
  return async (ctx, next) => {
    const ip = clientIp(ctx);
    const now = Date.now();
    const path = ctx.request.url.pathname;

    if (isChatReadPath(path)) {
      const hits = (chatReadBuckets.get(ip) ?? []).filter((t) => now - t < CHAT_READ_WINDOW_MS);
      if (hits.length >= CHAT_READ_MAX_REQUESTS) {
        ctx.response.status = 429;
        ctx.response.body = { error: "Too many requests, please try again later." };
        return;
      }
      hits.push(now);
      chatReadBuckets.set(ip, hits);
      await next();
      return;
    }

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