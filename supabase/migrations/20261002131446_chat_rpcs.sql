-- Chat RPCs, corrected. These existed in the live database with no migration file anywhere in the
-- repo, which is why a fatal bug in create_conversation shipped unnoticed (see status.md, section 4).
--
-- BUG: create_conversation selected an unquoted camelCase column:
--     select userId, type into ... from "Report" where id = p_report_id
-- Plpgsql folds unquoted identifiers to lower case, so this resolved to "userid", which does not
-- exist on a table whose column is the quoted "userId". Every call raised:
--     ERROR: 42703: column "userid" does not exist
--     HINT:  Perhaps you meant to reference the column "Report.userId".
-- The function therefore NEVER succeeded, so POST /api/conversations returned 500 and no thread
-- could ever be created. send_message already quoted every column correctly.
--
-- Fixed by quoting "userId". Both functions are reproduced here verbatim (send_message unchanged) so
-- the repo owns the chat RPCs instead of the database being the only copy.

-- One thread per (report, opener). The finder is always the report owner, so membership is the
-- opener plus the report owner. Raises rather than returning an envelope; the HTTP status travels
-- in the exception's DETAIL field, which _shared/rpc.ts maps onto an ApiError.
create or replace function public.create_conversation(p_report_id text, p_created_by text)
returns table(conversation_id text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_conv_id text;
  v_report_owner text;
  v_report_type text;
begin
  select r."userId", r.type into v_report_owner, v_report_type
  from "Report" r where r.id = p_report_id;
  if not found then
    raise exception using message = 'Report not found', errcode = 'P0002', detail = '404';
  end if;
  if v_report_owner = p_created_by then
    raise exception using message = 'You cannot start a chat with yourself', errcode = 'P0004', detail = '400';
  end if;
  if v_report_type <> 'FOUND' then
    raise exception using message = 'You can only chat about found items', errcode = 'P0005', detail = '400';
  end if;

  begin
    insert into "Conversation" ("reportId", "createdBy", "status")
    values (p_report_id, p_created_by, 'PENDING')
    returning id into v_conv_id;
  exception when unique_violation then
    raise exception using message = 'Conversation already exists', errcode = 'P0006', detail = '409';
  end;

  insert into "ConversationParticipant" ("conversationId", "userId")
  values (v_conv_id, p_created_by), (v_conv_id, v_report_owner)
  on conflict do nothing;

  return query select v_conv_id;
end;
$$;

-- Insert, bump lastMessageAt, notify the recipient, atomically. The unique
-- (conversationId, clientId) constraint is the dedupe key: a retried send raises 409 and the router
-- resolves it to the existing row instead of duplicating.
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
    insert into "Notification" ("userId", "message", "type", "isRead")
    values (v_recipient, 'New message received', 'MESSAGE_RECEIVED', false);
  end if;

  return query select v_msg_id;
end;
$$;

notify pgrst, 'reload schema';