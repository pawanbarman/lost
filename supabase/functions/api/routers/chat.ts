import { Router } from "oak";
import { authenticate, requireAdmin } from "../_shared/auth.ts";
import { db } from "../_shared/db.ts";
import { ApiError } from "../_shared/error.ts";
import { validate } from "../_shared/validate.ts";
import { rpcCall } from "../_shared/rpc.ts";
import { readJson, readFormData, strField, fileField } from "../_shared/body.ts";
import { handleImage, CHAT_MAX_FILE_SIZE } from "../_shared/image.ts";
import { extractPublicIdFromUrl, deleteImage } from "../_shared/cloudinary.ts";
import {
  createConversationSchema,
  reportMessageSchema,
  sendMessageSchema,
} from "../validators/chat.ts";

const SEND_WINDOW_MS = 60 * 60 * 1000;
const SEND_MAX_PER_HOUR = 20;
const THREAD_WINDOW_MS = 24 * 60 * 60 * 1000;
const THREAD_MAX_PER_DAY = 10;
const sendBuckets = new Map<string, number[]>();
const threadBuckets = new Map<string, number[]>();

const router = new Router();
const routerPrefix = "/api/conversations";

router.use(routerPrefix, authenticate);

// ===== INBOX =====
router.get(routerPrefix, authenticate, async (ctx) => {
  const user = ctx.state.user;
  if (!user) throw new ApiError("Authentication required", 401);

  // Get conversations where user is participant
  const { data: participantRows, error } = await db()
    .from("ConversationParticipant")
    .select(
      "conversationId, lastReadAt, blocked, " +
        "conversation:Conversation!inner(" +
        "id, reportId, status, lastMessageAt, createdAt, " +
        "report:Report!inner(id, type, location, item:Item(id,title,category)), " +
        "createdBy:User!inner(id,name), " +
        "other:ConversationParticipant!inner(userId, user:User(id,name))" +
        ")"
    )
    .eq("userId", user.id);

  if (error) throw error;

  const conversations = (participantRows ?? [])
    .filter((p: any) => p.conversation)
    .map((p: any) => {
      const conv = p.conversation;
      const others = (conv.other ?? []).filter(
        (o: any) => o.userId !== user.id
      );
      const other = others[0]?.user ?? conv.createdBy ?? { id: "", name: "Unknown" };
      const unread = p.lastReadAt
        ? (conv.lastMessageAt
            ? new Date(conv.lastMessageAt) > new Date(p.lastReadAt)
            : false)
        : Boolean(conv.lastMessageAt);

      return {
        id: conv.id,
        reportId: conv.reportId,
        status: conv.status,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
        blocked: p.blocked,
        lastReadAt: p.lastReadAt,
        unread,
        other,
        report: {
          id: conv.report.id,
          type: conv.report.type,
          location: conv.report.location,
          item: conv.report.item,
        },
      };
    })
    .sort((a: any, b: any) => {
      const aTime = a.lastMessageAt ?? a.createdAt;
      const bTime = b.lastMessageAt ?? b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

  ctx.response.body = conversations;
});

// ===== UNREAD COUNT =====
router.get(`${routerPrefix}/unread-count`, authenticate, async (ctx) => {
  const user = ctx.state.user;
  if (!user) throw new ApiError("Authentication required", 401);

  const { data: participantRows, error } = await db()
    .from("ConversationParticipant")
    .select("lastReadAt, conversation:Conversation!inner(lastMessageAt)")
    .eq("userId", user.id)
    .eq("blocked", false);

  if (error) throw error;

  let unread = 0;
  for (const p of participantRows ?? []) {
    const conv = (p as any).conversation;
    if (!conv?.lastMessageAt) continue;
    if (!p.lastReadAt || new Date(conv.lastMessageAt) > new Date(p.lastReadAt)) {
      unread++;
    }
  }
  ctx.response.body = { unread };
});

// ===== CREATE CONVERSATION =====
router.post(routerPrefix, authenticate, async (ctx) => {
  const user = ctx.state.user;
  if (!user) throw new ApiError("Authentication required", 401);
  const validated = validate(createConversationSchema, await readJson<unknown>(ctx));

  const { data: report, error: rerr } = await db()
    .from("Report")
    .select("id,userId,type")
    .eq("id", validated.reportId)
    .maybeSingle();
  if (rerr) throw rerr;
  if (!report) throw new ApiError("Report not found", 404);

  if (report.userId === user.id) {
    throw new ApiError("You cannot start a chat with yourself", 400);
  }
  if (report.type !== "FOUND") {
    throw new ApiError("You can only chat about found items", 400);
  }

  try {
    const res = await rpcCall<{ conversation_id: string }>(
      "create_conversation",
      {
        p_report_id: validated.reportId,
        p_created_by: user.id,
      }
    );
    ctx.response.status = 201;
    ctx.response.body = { id: res.conversation_id };
  } catch (e) {
    if (e instanceof ApiError && e.statusCode === 409) {
      const { data: existing } = await db()
        .from("Conversation")
        .select("id")
        .eq("reportId", validated.reportId)
        .eq("createdBy", user.id)
        .maybeSingle();
      ctx.response.status = 200;
      ctx.response.body = { id: existing?.id };
      return;
    }
    throw e;
  }
});

// ===== GET MESSAGES (keyset) =====
router.get(`${routerPrefix}/:id/messages`, authenticate, async (ctx) => {
  const user = ctx.state.user;
  if (!user) throw new ApiError("Authentication required", 401);
  const convId = ctx.params.id;
  const before = ctx.request.url.searchParams.get("before");
  const limit = Math.min(Number(ctx.request.url.searchParams.get("limit") ?? "50"), 100);

  const { data: member, error: merr } = await db()
    .from("ConversationParticipant")
    .select("userId, blocked")
    .eq("conversationId", convId)
    .eq("userId", user.id)
    .maybeSingle();
  if (merr) throw merr;
  if (!member) throw new ApiError("Not a participant", 403);
  if (member.blocked) throw new ApiError("Conversation is blocked", 403);

  let q = db()
    .from("Message")
    .select("id, conversationId, senderId, body, imageUrl, clientId, createdAt")
    .eq("conversationId", convId)
    .order("createdAt", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("createdAt", before);
  const { data: msgs, error } = await q;
  if (error) throw error;
  const reversed = [...(msgs ?? [])].reverse();
  ctx.response.body = reversed;
});

// ===== SEND MESSAGE =====
router.post(`${routerPrefix}/:id/messages`, authenticate, async (ctx) => {
  const user = ctx.state.user;
  if (!user) throw new ApiError("Authentication required", 401);
  const convId = ctx.params.id;
  // Per-user send throttle
  const key = `u:${user.id}`
  const now = Date.now()
  const hits = (sendBuckets.get(key) ?? []).filter((t) => now - t < SEND_WINDOW_MS)
  if (hits.length >= SEND_MAX_PER_HOUR) {
    ctx.response.status = 429
    ctx.response.body = { error: "Too many messages, please try again later." }
    return
  }
  hits.push(now)
  sendBuckets.set(key, hits)

  let bodyText: string | undefined
  let imageUrl: string | undefined
  let clientId: string | undefined

  const contentType = ctx.request.headers.get("content-type") ?? ""
  if (contentType.includes("multipart/form-data")) {
    const form = await readFormData(ctx)
    bodyText = strField(form, "body")
    clientId = strField(form, "clientId")
    const file = fileField(form, "image")
    if (file) {
      const uploadedUrl = await handleImage(file, user, { folderSuffix: "chat/" + convId, maxSize: CHAT_MAX_FILE_SIZE })
      if (uploadedUrl) imageUrl = uploadedUrl
    }
  } else {
    const body = await readJson<unknown>(ctx)
    const validated = validate(sendMessageSchema, body as any)
    bodyText = validated.body
    imageUrl = validated.imageUrl
    clientId = validated.clientId
  }

  if ((!bodyText || bodyText.trim().length === 0) && !imageUrl) throw new ApiError("A message must have either body text or an image", 400)
  if (bodyText && bodyText.trim().length > 2000) throw new ApiError("Message body is too long", 400)
  if (bodyText && bodyText.trim().length === 0) bodyText = undefined

  const { data: member, error: merr } = await db()
    .from("ConversationParticipant")
    .select("userId, blocked")
    .eq("conversationId", convId)
    .eq("userId", user.id)
    .maybeSingle()
  if (merr) throw merr
  if (!member) throw new ApiError("Not a participant", 403)
  if (member.blocked) throw new ApiError("Conversation is blocked", 403)

  try {
    const res = await rpcCall<{ message_id: string }>("send_message", { p_conversation_id: convId, p_sender_id: user.id, p_body: bodyText ?? null, p_image_url: imageUrl ?? null, p_client_id: clientId ?? null })
    ctx.response.status = 201
    ctx.response.body = { id: res.message_id }
  } catch (e) {
    if (imageUrl) {
      try { const pid = extractPublicIdFromUrl(imageUrl); if (pid) await deleteImage(pid) } catch (_e) {}
    }
    if (e instanceof ApiError && e.statusCode === 409 && clientId) {
      const { data: m } = await db().from("Message").select("id").eq("conversationId", convId).eq("clientId", clientId).maybeSingle()
      ctx.response.status = 200; ctx.response.body = { id: m?.id }; return
    }
    throw e
  }
});

// ===== MARK READ =====
router.put(`${routerPrefix}/:id/read`, authenticate, async (ctx) => {
  const user = ctx.state.user;
  if (!user) throw new ApiError("Authentication required", 401);
  const convId = ctx.params.id;

  const { data: member } = await db()
    .from("ConversationParticipant")
    .select("userId")
    .eq("conversationId", convId)
    .eq("userId", user.id)
    .maybeSingle();
  if (!member) throw new ApiError("Not a participant", 403);

  const { error } = await db()
    .from("ConversationParticipant")
    .update({ lastReadAt: new Date().toISOString() })
    .eq("conversationId", convId)
    .eq("userId", user.id);
  if (error) throw error;
  ctx.response.status = 204;
});

// ===== ACCEPT CONVERSATION (finder accepts) =====
router.put(`${routerPrefix}/:id/accept`, authenticate, async (ctx) => {
  const user = ctx.state.user;
  if (!user) throw new ApiError("Authentication required", 401);
  const convId = ctx.params.id;

  const { data: conv, error: cerr } = await db()
    .from("Conversation")
    .select("id, status, reportId, report:Report!inner(userId)")
    .eq("id", convId)
    .maybeSingle();
  if (cerr) throw cerr;
  if (!conv) throw new ApiError("Conversation not found", 404);
  const reportOwner = (conv as any).report?.userId;
  if (reportOwner !== user.id) {
    throw new ApiError("Only the finder can accept", 403);
  }
  if (conv.status === "BLOCKED") {
    throw new ApiError("Conversation is blocked", 403);
  }
  const { error } = await db()
    .from("Conversation")
    .update({ status: "ACCEPTED" })
    .eq("id", convId);
  if (error) throw error;
  ctx.response.status = 204;
});

// ===== BLOCK CONVERSATION =====
router.put(`${routerPrefix}/:id/block`, authenticate, async (ctx) => {
  const user = ctx.state.user;
  if (!user) throw new ApiError("Authentication required", 401);
  const convId = ctx.params.id;

  const { data: member } = await db()
    .from("ConversationParticipant")
    .select("userId")
    .eq("conversationId", convId)
    .eq("userId", user.id)
    .maybeSingle();
  if (!member) throw new ApiError("Not a participant", 403);

  const { error } = await db()
    .from("ConversationParticipant")
    .update({ blocked: true })
    .eq("conversationId", convId)
    .eq("userId", user.id);
  if (error) throw error;
  ctx.response.status = 204;
});

// ===== REPORT MESSAGE =====
router.post(`${routerPrefix}/:id/messages/:messageId/report`, authenticate, async (ctx) => {
  const user = ctx.state.user;
  if (!user) throw new ApiError("Authentication required", 401);
  const convId = ctx.params.id;
  const messageId = ctx.params.messageId;
  const validated = validate(reportMessageSchema, await readJson<unknown>(ctx));

  const { data: member } = await db()
    .from("ConversationParticipant")
    .select("userId")
    .eq("conversationId", convId)
    .eq("userId", user.id)
    .maybeSingle();
  if (!member) throw new ApiError("Not a participant", 403);

  const { data: msg } = await db()
    .from("Message")
    .select("id, conversationId")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg || msg.conversationId !== convId) {
    throw new ApiError("Message not found", 404);
  }

  const { error } = await db()
    .from("MessageReport")
    .upsert(
      {
        messageId,
        reporterId: user.id,
        reason: validated.reason,
        status: "OPEN",
      },
      { onConflict: "MessageReport_messageId_reporterId_key" }
    );
  if (error) throw error;
  ctx.response.status = 201;
  ctx.response.body = { ok: true };
});

// ===== ADMIN: transcript =====
router.get("/api/admin/conversations/:id", authenticate, requireAdmin, async (ctx) => {
  const convId = ctx.params.id;
  const { data: conv, error: cerr } = await db()
    .from("Conversation")
    .select(
      "id, status, reportId, createdAt, " +
        "report:Report(id,type,item:Item(title)), " +
        "participants:ConversationParticipant(userId,user:User(id,name,email))"
    )
    .eq("id", convId)
    .maybeSingle();
  if (cerr) throw cerr;
  if (!conv) throw new ApiError("Conversation not found", 404);

  const { data: msgs } = await db()
    .from("Message")
    .select("id, senderId, body, imageUrl, clientId, createdAt, sender:User(id,name)")
    .eq("conversationId", convId)
    .order("createdAt", { ascending: true });
  ctx.response.body = Object.assign({}, conv as unknown as Record<string, unknown>, { messages: msgs ?? [] });
});

// ===== ADMIN: moderation queue =====
router.get("/api/admin/chat-reports", authenticate, requireAdmin, async (ctx) => {
  const { data, error } = await db()
    .from("MessageReport")
    .select(
      "id, reason, status, createdAt, resolvedAt, " +
        "reporter:User(id,name,email), " +
        "resolvedByUser:User!MessageReport_resolvedBy_fkey(id,name), " +
        "message:Message(id,body,imageUrl,createdAt,sender:User(id,name,email),conversationId)"
    )
    .order("createdAt", { ascending: false });
  if (error) throw error;
  ctx.response.body = data ?? [];
});

// ===== ADMIN: resolve/dismiss =====
router.put("/api/admin/chat-reports/:id", authenticate, requireAdmin, async (ctx) => {
  const id = ctx.params.id;
  const body = await readJson<unknown>(ctx);
  const action = (body as any)?.action;
  if (action !== "resolve" && action !== "dismiss") {
    throw new ApiError("action must be 'resolve' or 'dismiss'", 400);
  }
  const status = action === "resolve" ? "RESOLVED" : "DISMISSED";
  const user = ctx.state.user;
  const { error } = await db()
    .from("MessageReport")
    .update({
      status,
      resolvedBy: user?.id ?? null,
      resolvedAt: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "OPEN");
  if (error) throw error;
  ctx.response.status = 204;
});

export default router;





