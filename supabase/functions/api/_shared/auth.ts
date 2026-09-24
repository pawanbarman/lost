import type { Middleware, State } from "oak";
import { db } from "./db.ts";
import { verifyToken } from "./jwt.ts";

export type UserRole = "USER" | "ADMIN";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  communityId: string | null;
}

export interface AppState extends State {
  user?: AuthUser;
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

export const authenticate: Middleware<AppState> = async (ctx, next) => {
  const token = bearerToken(ctx.request.headers.get("Authorization"));

  if (!token) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Authentication required" };
    return;
  }

  let userId: string;
  try {
    ({ userId } = await verifyToken(token));
  } catch {
    ctx.response.status = 401;
    ctx.response.body = { error: "Invalid token" };
    return;
  }

  const { data, error } = await db()
    .from("User")
    .select("id, name, email, role, communityId")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    ctx.response.status = 401;
    ctx.response.body = { error: "User not found" };
    return;
  }

  ctx.state.user = data as AuthUser;
  await next();
};

export const requireAdmin: Middleware<AppState> = async (ctx, next) => {
  if (ctx.state.user?.role !== "ADMIN") {
    ctx.response.status = 403;
    ctx.response.body = { error: "Admin access required" };
    return;
  }
  await next();
};