import { Router } from "oak";
import { db } from "../_shared/db.ts";
import { readJson } from "../_shared/body.ts";
import { requireAdmin, authenticate } from "../_shared/auth.ts";
import { EVENT_REPORTS_SELECT } from "../_shared/selectors.ts";

const router = new Router({ prefix: "/api/events" });

router.post("/", authenticate, requireAdmin, async (ctx) => {
  const { name, venue, location, startDate, endDate } = await readJson<Record<string, unknown>>(ctx);

  const { data, error } = await db()
    .from("Event")
    .insert({
      id: crypto.randomUUID(),
      name,
      venue,
      location,
      startDate: new Date(String(startDate)).toISOString(),
      endDate: new Date(String(endDate)).toISOString(),
      qrCode: `/event/${Date.now()}`,
    })
    .select("*")
    .single();
  if (error) throw error;

  ctx.response.status = 201;
  ctx.response.body = data;
});

router.get("/", async (ctx) => {
  const { data, error } = await db()
    .from("Event")
    .select("*")
    .eq("active", true)
    .order("startDate", { ascending: false });
  if (error) throw error;

  ctx.response.body = data;
});

router.get("/:id", async (ctx) => {
  const { data, error } = await db()
    .from("Event")
    .select(`*,reports:Report(${EVENT_REPORTS_SELECT})`)
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Event not found" };
    return;
  }

  ctx.response.body = data;
});

router.put("/:id", authenticate, requireAdmin, async (ctx) => {
  const { name, venue, location, startDate, endDate, active } = await readJson<Record<string, unknown>>(ctx);

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (venue !== undefined) data.venue = venue;
  if (location !== undefined) data.location = location;
  if (startDate) data.startDate = new Date(String(startDate)).toISOString();
  if (endDate) data.endDate = new Date(String(endDate)).toISOString();
  if (active !== undefined) data.active = active;

  const { data: updated, error } = await db()
    .from("Event")
    .update(data)
    .eq("id", ctx.params.id)
    .select("*");
  if (error) throw error;

  if (!updated || updated.length === 0) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Record not found" };
    return;
  }

  ctx.response.body = updated[0];
});

router.delete("/:id", authenticate, requireAdmin, async (ctx) => {
  const { data, error } = await db()
    .from("Event")
    .delete()
    .eq("id", ctx.params.id)
    .select("id");
  if (error) throw error;

  if (!data || data.length === 0) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Record not found" };
    return;
  }

  ctx.response.body = { message: "Event deleted successfully" };
});

export default router;