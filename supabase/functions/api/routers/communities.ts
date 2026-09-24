import { Router } from "oak";
import { db } from "../_shared/db.ts";
import { readJson } from "../_shared/body.ts";
import { requireAdmin, authenticate } from "../_shared/auth.ts";
import { ApiError } from "../_shared/error.ts";

const router = new Router({ prefix: "/api/communities" });

router.post("/", authenticate, requireAdmin, async (ctx) => {
  const { name, code, description } = await readJson<Record<string, unknown>>(ctx);

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Community name is required" };
    return;
  }

  const now = new Date().toISOString();
  const { data, error } = await db()
    .from("Community")
    .insert({
      id: crypto.randomUUID(),
      name: name.trim(),
      code: code ? String(code).trim() : null,
      description: description ? String(description) : null,
      updatedAt: now,
    })
    .select("*")
    .single();

  if (error?.code === "23505") {
    throw new ApiError("A community with this code already exists", 400);
  }
  if (error) throw error;

  ctx.response.status = 201;
  ctx.response.body = data;
});

router.get("/", async (ctx) => {
  const { data, error } = await db()
    .from("Community")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;

  ctx.response.body = data;
});

export default router;