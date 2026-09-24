import type { Middleware } from "oak";

// Mirrors the subset of Helmet that makes sense for a JSON API.
export function securityHeaders(): Middleware {
  return async (ctx, next) => {
    ctx.response.headers.set("X-Content-Type-Options", "nosniff");
    ctx.response.headers.set("X-Frame-Options", "DENY");
    ctx.response.headers.set("Referrer-Policy", "no-referrer");
    ctx.response.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    await next();
  };
}