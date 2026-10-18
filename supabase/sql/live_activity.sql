-- Live Activity (iOS) / Live-Benachrichtigung (Android) für laufende Ablaufpläne.
-- Used by src/app/services/live-activity/live-activity.service.ts (writes tokens)
-- and the live-activity-tick Edge Function (reads tokens, remembers what it sent).

-- Per-user switch in the notification settings; null/true = on.
alter table public.notifications add column if not exists live_activity boolean default true;

-- ActivityKit push tokens. kind 'start' = push-to-start token of the device
-- (iOS 17.2+, attendance_id 0 / plan_key ''); kind 'update' = token of one
-- running Live Activity. One row per user and kind/plan: like device_tokens,
-- the latest device wins.
create table if not exists public.live_activity_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  kind text not null check (kind in ('start', 'update')),
  attendance_id bigint not null default 0,
  plan_key text not null default '',
  token text not null,
  platform text not null default 'ios',
  updated_at timestamptz not null default now(),
  unique (user_id, kind, attendance_id, plan_key)
);

alter table public.live_activity_tokens enable row level security;

drop policy if exists "owner manages live activity tokens" on public.live_activity_tokens;
create policy "owner manages live activity tokens"
  on public.live_activity_tokens for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Last state the Edge Function delivered per user and plan, so it only
-- pushes when the visible state changes. Service role only (no policies).
create table if not exists public.live_activity_sent (
  user_id uuid not null,
  attendance_id bigint not null,
  plan_key text not null,
  state_key text not null,
  phase text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, attendance_id, plan_key)
);

alter table public.live_activity_sent enable row level security;

-- Every minute; plan items start on full minutes, so changes go out within seconds.
-- Same pattern as the other reminder jobs (vault secrets project_url / anon_key).
select cron.schedule('live-activity-tick-job', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/live-activity-tick',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb
  );
$$);
