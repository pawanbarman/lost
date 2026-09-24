// bcryptjs ships no TS type declarations; wrap it so callers stay typed.
// deno-lint-ignore no-explicit-any
// @ts-ignore npm:bcryptjs has no bundled types
import bcrypt from "bcryptjs";

export async function hashPassword(value: string, rounds: number): Promise<string> {
  return await bcrypt.hash(value, rounds);
}

export async function comparePassword(value: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(value, hash);
}