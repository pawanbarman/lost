-- Chat schema: conversations, participants, messages, message reports.
--
-- WHY this file: the chat tables must have RLS enabled in the same migration as they are created.
-- See status.md §4 (C1). The enum value 'MESSAGE_RECEIVED' exists in NotificationType (added in the
-- preceding migration). ConversationStatus does not yet exist and is created here.

-- Enum for conversation lifecycle (no CLOSED). Block is terminal.
create type "ConversationStatus" as enum ('PENDING', 'ACCEPTED', 'BLOCKED');

-- Enum for message report moderation
create type "MessageReportStatus" as enum ('OPEN', 'RESOLVED', 'DISMISSED');

-- A conversation about a specific found report. At most one thread per (reportId, createdBy).
-- The finder is always the report owner, so a non-owner opening a thread means they want to talk to
-- the finder. Uniqueness prevents duplicate threads for the same pair.
create table "Conversation" (
  "id"             text not null primary key default gen_random_uuid(),
  "reportId"       text not null references "Report"("id") on delete cascade,
  "createdBy"      text not null references "User"("id") on delete cascade,
  "status"         "ConversationStatus" not null default 'PENDING',
  "lastMessageAt"  timestamp(3) null,
  "createdAt"      timestamp(3) not null default now(),
  "updatedAt"      timestamp(3) null,
  constraint "Conversation_reportId_createdBy_key" unique ("reportId", "createdBy")
);

-- Membership in a conversation. Both participants have a row to support unread and block.
create table "ConversationParticipant" (
  "conversationId" text not null references "Conversation"("id") on delete cascade,
  "userId"         text not null references "User"("id") on delete cascade,
  "lastReadAt"     timestamp(3) null,
  "blocked"        boolean not null default false,
  primary key ("conversationId", "userId")
);

-- Messages in a conversation. At least one of body/imageUrl required.
create table "Message" (
  "id"             text not null primary key default gen_random_uuid(),
  "conversationId" text not null references "Conversation"("id") on delete cascade,
  "senderId"       text not null references "User"("id") on delete cascade,
  "body"           text null,
  "imageUrl"       text null,
  "clientId"       text null,
  "createdAt"      timestamp(3) not null default now(),
  constraint "Message_conversationId_clientId_key" unique ("conversationId", "clientId"),
  constraint "Message_body_or_image_required" check (
    (body is not null and length(trim(body)) between 1 and 2000)
    or (imageUrl is not null and trim(imageUrl) <> '')
  )
);

-- User-reported messages for moderation
create table "MessageReport" (
  "id"           text not null primary key default gen_random_uuid(),
  "messageId"    text not null references "Message"("id") on delete cascade,
  "reporterId"   text not null references "User"("id") on delete cascade,
  "reason"       text not null,
  "status"       "MessageReportStatus" not null default 'OPEN',
  "resolvedBy"   text null references "User"("id") on delete set null,
  "resolvedAt"   timestamp(3) null,
  "createdAt"    timestamp(3) not null default now(),
  constraint "MessageReport_messageId_reporterId_key" unique ("messageId", "reporterId")
);

-- Indexes for keyset pagination and unread queries
create index "Message_conversationId_createdAt_idx" on "Message" ("conversationId", "createdAt" desc);
create index "ConversationParticipant_userId_blocked_idx" on "ConversationParticipant" ("userId", "blocked");
create index "MessageReport_status_idx" on "MessageReport" ("status");

-- RLS must ship in the same migration as create table (default privileges grant anon/authenticated)
alter table "Conversation" enable row level security;
alter table "ConversationParticipant" enable row level security;
alter table "Message" enable row level security;
alter table "MessageReport" enable row level security;

-- Tell PostgREST to reload schema so new tables/types are visible immediately
notify pgrst, 'reload schema';