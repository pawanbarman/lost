import { Router } from "oak";
import { db } from "../_shared/db.ts";
import { authenticate } from "../_shared/auth.ts";

const router = new Router({ prefix: "/api/notifications" });

router.get("/", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const { data, error } = await db()
    .from("Notification")
    .select("*")
    .eq("userId", user.id)
    .order("createdAt", { ascending: false });
  if (error) throw error;

  ctx.response.body = data;
});

router.get("/unread-count", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const { count, error } = await db()
    .from("Notification")
    .select("id", { count: "exact", head: true })
    .eq("userId", user.id)
    .eq("isRead", false);
  if (error) throw error;

  ctx.response.body = { count: count ?? 0 };
});

router.put("/:id/read", authenticate, async (ctx) => {
  const user = ctx.state.user!;

  const { data: notification, error: findError } = await db()
    .from("Notification")
    .select("id,userId")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (findError) throw findError;

  if (!notification) {
    ctx.response.status = 404;
    ctx.response.body = { error: "Notification not found" };
    return;
  }

  if (notification.userId !== user.id) {
    ctx.response.status = 403;
    ctx.response.body = { error: "Not authorized" };
    return;
  }

  const { data: updated, error } = await db()
    .from("Notification")
    .update({ isRead: true })
    .eq("id", ctx.params.id)
    .select("*")
    .single();
  if (error) throw error;

  ctx.response.body = updated;
});

router.put("/read-all", authenticate, async (ctx) => {
  const user = ctx.state.user!;
  const { error } = await db()
    .from("Notification")
    .update({ isRead: true })
    .eq("userId", user.id)
    .eq("isRead", false);
  if (error) throw error;

  ctx.response.body = { message: "All notifications marked as read" };
});

export default router;