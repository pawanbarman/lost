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