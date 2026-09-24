import type { Middleware } from "oak";
import { env } from "./env.ts";

const CORS_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const CORS_HEADERS = "Authorization, Content-Type";

export function applyCors(): Middleware {
  return async (ctx, next) => {
    const origin = ctx.request.headers.get("Origin");
    const allowed = env.allowedOrigins;

    if (origin && allowed.includes(origin)) {
      ctx.response.headers.set("Access-Control-Allow-Origin", origin);
      ctx.response.headers.set("Vary", "Origin");
      ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
    }

    ctx.response.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
    ctx.response.headers.set("Access-Control-Allow-Headers", CORS_HEADERS);

    if (ctx.request.method === "OPTIONS") {
      ctx.response.status = 204;
      return;
    }

    await next();
  };
}