import type { z } from "zod";
import { ApiError } from "./error.ts";

// Zod parse that surfaces the first validation message as a 400, matching the
// Express controllers' `error.errors[0].message` behaviour.
export function validate<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(result.error.issues[0]?.message ?? "Invalid input", 400);
  }
  return result.data;
}