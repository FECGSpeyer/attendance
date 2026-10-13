-- Mitteilungen: general messages sent by tenant admins/responsibles to all
-- active members via push/Telegram (opt-out via notifications.messages) and
-- email, with per-recipient delivery/read tracking.
--
-- Rows are written exclusively by the send-message / resend-webhook Edge
-- Functions (service_role). Clients only read them, delete whole messages
-- (admins) and mark their own copy read via mark_message_read().

-- Per-user opt-out for push/Telegram delivery of messages (email is always sent).
alter table public.notifications
  add column if not exists messages boolean not null default true;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  "tenantId" bigint not null references public.tenants(id) on delete cascade,
  sender_id text not null,                    -- auth.uid()::text of the sender
  sender_name text,
  title text not null,
  body_json jsonb not null default '{}'::jsonb, -- Tiptap document
  body_html text not null default '',         -- server-rendered, allowlisted HTML
  body_text text not null default '',         -- plain text for push/Telegram
  channels text[] not null default '{push,email}',
  group_ids bigint[],                         -- null = all active members
  recipient_count integer not null default 0,
  status text not null default 'sending',     -- sending | sent
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists messages_tenant_created_idx
  on public.messages ("tenantId", created_at desc);

create table if not exists public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  "tenantId" bigint not null,
  player_id bigint references public.player(id) on delete set null,
  user_id text,                               -- player.appId::text, null without app account
  name text not null default '',
  group_id bigint,
  email text,
  push_enabled boolean not null default false, -- had push/Telegram eligibility at send time
  push_sent_at timestamptz,
  telegram_sent_at timestamptz,
  push_failed boolean not null default false,
  email_sent_at timestamptz,
  email_delivered_at timestamptz,
  email_opened_at timestamptz,
  email_bounced_at timestamptz,
  email_failed boolean not null default false,
  resend_email_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists message_recipients_message_idx
  on public.message_recipients (message_id);
create index if not exists message_recipients_user_idx
  on public.message_recipients (user_id, "tenantId");
create index if not exists message_recipients_resend_idx
  on public.message_recipients (resend_email_id)
  where resend_email_id is not null;

alter table public.messages enable row level security;
alter table public.message_recipients enable row level security;

-- messages ------------------------------------------------------------------

drop policy if exists "tenant admin can read messages" on public.messages;
create policy "tenant admin can read messages"
  on public.messages for select to authenticated
  using (
    "tenantId" in (
      select "tenantId" from "tenantUsers"
      where "userId" = auth.uid()::text and role in (1, 5)
    )
  );

drop policy if exists "recipient can read messages" on public.messages;
create policy "recipient can read messages"
  on public.messages for select to authenticated
  using (
    id in (
      select message_id from public.message_recipients
      where user_id = auth.uid()::text
    )
  );

drop policy if exists "tenant admin can delete messages" on public.messages;
create policy "tenant admin can delete messages"
  on public.messages for delete to authenticated
  using (
    "tenantId" in (
      select "tenantId" from "tenantUsers"
      where "userId" = auth.uid()::text and role in (1, 5)
    )
  );

drop policy if exists "service_role manage messages" on public.messages;
create policy "service_role manage messages"
  on public.messages for all to service_role
  using (true) with check (true);

-- message_recipients ---------------------------------------------------------

drop policy if exists "tenant admin can read message recipients" on public.message_recipients;
create policy "tenant admin can read message recipients"
  on public.message_recipients for select to authenticated
  using (
    "tenantId" in (
      select "tenantId" from "tenantUsers"
      where "userId" = auth.uid()::text and role in (1, 5)
    )
  );

drop policy if exists "recipient can read own message recipient row" on public.message_recipients;
create policy "recipient can read own message recipient row"
  on public.message_recipients for select to authenticated
  using (user_id = auth.uid()::text);

drop policy if exists "service_role manage message recipients" on public.message_recipients;
create policy "service_role manage message recipients"
  on public.message_recipients for all to service_role
  using (true) with check (true);

-- mark_message_read ----------------------------------------------------------
-- Marks the caller's copy of a message read (first read wins) and clears the
-- matching notification-center entries.
create or replace function public.mark_message_read(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.message_recipients
     set read_at = now()
   where message_id = p_message_id
     and user_id = auth.uid()::text
     and read_at is null;

  update public.user_notifications
     set read = true
   where user_id = auth.uid()::text
     and type = 'message'
     and read = false
     and data ->> 'messageId' = p_message_id::text;
end;
$$;

revoke all on function public.mark_message_read(uuid) from public, anon;
grant execute on function public.mark_message_read(uuid) to authenticated;

-- Deleting a message also removes its notification-center entries, which
-- members cannot delete for each other.
create or replace function public.delete_message_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_notifications
   where type = 'message'
     and data ->> 'messageId' = old.id::text;
  return old;
end;
$$;

revoke all on function public.delete_message_notifications() from public, anon, authenticated;

drop trigger if exists messages_delete_notifications on public.messages;
create trigger messages_delete_notifications
  after delete on public.messages
  for each row execute function public.delete_message_notifications();
