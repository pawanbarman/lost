-- Fix send_message: it could never insert its notification, so no message could ever be sent.
--
-- BUG: the notification insert omitted "id":
--     insert into "Notification" ("userId", "message", "type", "isRead") values (...)
-- "Notification"."id" is text NOT NULL with NO default (unlike the chat tables, which declare
-- default gen_random_uuid()), so every send died on:
--     ERROR: 23502: null value in column "id" of relation "Notification" violates not-null constraint
-- Every POST /api/conversations/:id/messages returned 500. The application always supplies the id
-- explicitly, see routers/admin.ts:121, so the RPC had to do the same.
--
-- gen_random_uuid()::text matches the column type. Same class of bug as the unquoted "userId" in
-- create_conversation: both RPCs existed only in the live database, so nothing ever executed them.

create or replace function public.send_message(
  p_conversation_id text,
  p_sender_id text,
  p_body text,
  p_image_url text,
  p_client_id text
)
returns table(message_id text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_msg_id text;
  v_blocked boolean;
  v_is_member boolean;
  v_report_owner text;
  v_recipient text;
begin
  select exists(
    select 1 from "ConversationParticipant" cp
    where cp."conversationId" = p_conversation_id and cp."userId" = p_sender_id
  ) into v_is_member;
  if not v_is_member then
    raise exception using message = 'Not a participant', errcode = 'P0010', detail = '403';
  end if;

  select cp.blocked into v_blocked
  from "ConversationParticipant" cp
  where cp."conversationId" = p_conversation_id and cp."userId" = p_sender_id;
  if v_blocked then
    raise exception using message = 'Conversation is blocked', errcode = 'P0011', detail = '403';
  end if;

  if p_body is null and p_image_url is null then
    raise exception using message = 'A message must have either body text or an image', errcode = 'P0012', detail = '400';
  end if;
  if p_body is not null and length(trim(p_body)) > 2000 then
    raise exception using message = 'Message body is too long', errcode = 'P0013', detail = '400';
  end if;
  if p_body is not null and length(trim(p_body)) = 0 then
    raise exception using message = 'A message must have either body text or an image', errcode = 'P0014', detail = '400';
  end if;
  if p_image_url is not null and trim(p_image_url) = '' then
    raise exception using message = 'Invalid image URL', errcode = 'P0015', detail = '400';
  end if;

  begin
    insert into "Message" ("conversationId", "senderId", "body", "imageUrl", "clientId")
    values (p_conversation_id, p_sender_id, p_body, p_image_url, p_client_id)
    returning id into v_msg_id;
  exception when unique_violation then
    if p_client_id is not null then
      select m.id into v_msg_id from "Message" m
      where m."conversationId" = p_conversation_id and m."clientId" = p_client_id;
      if v_msg_id is not null then
        raise exception using message = 'Message already exists', errcode = 'P0007', detail = '409';
      end if;
    end if;
    raise;
  end;

  update "Conversation"
  set "lastMessageAt" = now(), "updatedAt" = now()
  where id = p_conversation_id;

  select r."userId" into v_report_owner
  from "Conversation" c
  join "Report" r on r.id = c."reportId"
  where c.id = p_conversation_id;

  select cp2."userId" into v_recipient
  from "ConversationParticipant" cp2
  where cp2."conversationId" = p_conversation_id and cp2."userId" <> p_sender_id
  limit 1;

  if v_recipient is not null then
    insert into "Notification" ("id", "userId", "message", "type", "isRead")
    values (gen_random_uuid()::text, v_recipient, 'New message received', 'MESSAGE_RECEIVED', false);
  end if;

  return query select v_msg_id;
end;
$$;

notify pgrst, 'reload schema';