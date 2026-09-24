import { Router } from "oak";
import { db } from "../_shared/db.ts";
import { readJson } from "../_shared/body.ts";
import { requireAdmin, authenticate } from "../_shared/auth.ts";

const router = new Router({ prefix: "/api/categories" });

router.post("/", authenticate, requireAdmin, async (ctx) => {
  const { name } = await readJson<Record<string, unknown>>(ctx);

  const { data, error } = await db()
    .from("Category")
    .insert({ id: crypto.randomUUID(), name })
    .select("*")
    .single();
  if (error) throw error;

  ctx.response.status = 201;
  ctx.response.body = data;
});

router.get("/", async (ctx) => {
  const { data, error } = await db()
    .from("Category")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;

  ctx.response.body = data;
});

router.delete("/:id", authenticate, requireAdmin, async (ctx) => {
  const { data, error } = await db()
    .from("Category")
    .delete()
    .eq("id", ctx.params.id)
    .select("id");
  if (error) throw error;

  if (!data || data.length === 0) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Record not found" };
    return;
  }

  ctx.response.body = { message: "Category deleted successfully" };
});

export default router;