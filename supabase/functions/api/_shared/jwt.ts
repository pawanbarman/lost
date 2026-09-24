import { SignJWT, jwtVerify } from "jose";
import { env } from "./env.ts";

type JwtPayload = { userId: string };

function getSecret(): Uint8Array {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is required");
  }
  return new TextEncoder().encode(env.jwtSecret);
}

export async function generateToken(userId: string): Promise<string> {
  return await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
  const userId = payload.userId;
  if (typeof userId !== "string") {
    throw new Error("Token payload missing userId");
  }
  return { userId };
}

export const RESET_TTL_SECONDS = 30 * 60; // 30 minutes, single short-lived deliverable.
const RESET_PURPOSE = "password_reset";
type ResetPayload = { userId: string; purpose: string };

export async function generateResetToken(userId: string): Promise<string> {
  return await new SignJWT({ userId, purpose: RESET_PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${RESET_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifyResetToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
  if (payload.purpose !== RESET_PURPOSE) {
    throw new Error("Token is not a password reset token");
  }
  const userId = payload.userId;
  if (typeof userId !== "string") {
    throw new Error("Reset token payload missing userId");
  }
  return { userId };
}