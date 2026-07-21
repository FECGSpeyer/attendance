-- user_notifications: per-user notification feed (the "notification center").
-- One row per recipient per logical notification, tagged with the channel(s) it
-- was delivered through. Written by Edge Functions (service_role) right after a
-- successful push/telegram/email send. Read + marked-read by the owning user.
-- NOTE: distinct from the existing "notifications" table, which stores per-user
-- notification *settings*, not a feed.

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text,                              -- auth.uid()::text; nullable for external-email rows
  "tenantId" bigint not null,
  type text not null,                        -- reminder|checklist|criticals|birthday|attendance
  title text not null,
  body text not null,
  channels text[] not null default '{}',     -- {push} | {telegram} | {email}
  email text,                                -- external address when user_id is null (unused for now)
  data jsonb not null default '{}'::jsonb,   -- {attendanceId, tenantId, ...}
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_tenant_idx
  on public.user_notifications (user_id, "tenantId", read, created_at desc);

create index if not exists user_notifications_created_at_idx
  on public.user_notifications (created_at desc);

-- Supports the channel-merge dedupe lookup in log-notification.ts, which finds
-- an existing row by (user_id, tenantId, type, data->>attendanceId).
create index if not exists user_notifications_dedupe_idx
  on public.user_notifications (user_id, "tenantId", type, ((data ->> 'attendanceId')));

alter table public.user_notifications enable row level security;

-- Owner reads their own notifications.
drop policy if exists "owner can read notifications" on public.user_notifications;
create policy "owner can read notifications"
  on public.user_notifications for select to authenticated
  using (user_id = auth.uid()::text);

-- Owner marks their own notifications read.
drop policy if exists "owner can update notifications" on public.user_notifications;
create policy "owner can update notifications"
  on public.user_notifications for update to authenticated
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- Owner deletes their own notifications.
drop policy if exists "owner can delete notifications" on public.user_notifications;
create policy "owner can delete notifications"
  on public.user_notifications for delete to authenticated
  using (user_id = auth.uid()::text);

-- Edge Functions (service_role) create notifications.
drop policy if exists "service_role manage notifications" on public.user_notifications;
create policy "service_role manage notifications"
  on public.user_notifications for all to service_role
  using (true) with check (true);

-- Tenant admins/responsibles may insert in-app notifications (future in-app broadcasts).
drop policy if exists "tenant admin can insert notifications" on public.user_notifications;
create policy "tenant admin can insert notifications"
  on public.user_notifications for insert to authenticated
  with check (
    "tenantId" in (
      select "tenantId" from "tenantUsers"
      where "userId" = auth.uid()::text and role in (1, 5)
    )
  );
