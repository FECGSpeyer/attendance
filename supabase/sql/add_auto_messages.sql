-- Automatische Nachrichten (auto messages after a Termin)
-- ---------------------------------------------------------------------------
-- Admins and responsibles define rules per tenant ("Probe verpasst": members who
-- are still unexcused-absent 2 hours after a rehearsal get a message). The cron
-- function send-auto-messages evaluates the rules and sends a normal Mitteilung
-- (messages / message_recipients) per rule and Termin. Members can answer with a
-- reason or "I was there" (attendance_responses); admins/responsibles confirm.
--
-- Order: run this file, deploy the functions send-auto-messages,
-- attendance-response and send-message, then create the cron job at the end of
-- this file. Every rule starts disabled, so nothing is sent until a tenant
-- switches one on.

-- 1. Rules --------------------------------------------------------------------
create table if not exists public.auto_message_rules (
  id uuid primary key default gen_random_uuid(),
  "tenantId" bigint not null references public.tenants(id) on delete cascade,
  name text not null,
  enabled boolean not null default false,
  enabled_at timestamptz,                     -- Termine ending before this are never sent
  statuses smallint[] not null default '{4}', -- 4 unexcused, 3 late, 0 no answer
  type_ids text[],                            -- attendance_types.id, null = all
  group_ids bigint[],                         -- player.instrument, null = all
  delay_minutes integer not null default 120 check (delay_minutes between 0 and 10080),
  frequency text not null default 'each' check (frequency in ('each', 'streak', 'window')),
  frequency_count integer not null default 2 check (frequency_count between 1 and 50),
  frequency_days integer not null default 30 check (frequency_days between 1 and 365),
  channels text[] not null default '{push}',
  use_template boolean not null default true,
  template_key text not null default 'absent',
  title text,                                 -- custom text (use_template = false)
  body_json jsonb,
  allow_responses boolean not null default true,
  instant_excuse boolean not null default false,
  copy_responsibles boolean not null default false,
  copy_voice_leaders boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auto_message_rules_tenant_idx
  on public.auto_message_rules ("tenantId");
create index if not exists auto_message_rules_enabled_idx
  on public.auto_message_rules (enabled) where enabled;

-- 2. One run per rule and Termin (dedupe + history) -------------------------------
create table if not exists public.auto_message_runs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.auto_message_rules(id) on delete cascade,
  "tenantId" bigint not null,
  attendance_id bigint not null references public.attendance(id) on delete cascade,
  status text not null check (status in ('sent', 'none', 'not_recorded', 'suspended')),
  message_id uuid references public.messages(id) on delete set null,
  recipient_count integer not null default 0,
  created_by text,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique (rule_id, attendance_id)
);

create index if not exists auto_message_runs_attendance_idx
  on public.auto_message_runs (attendance_id);
create index if not exists auto_message_runs_rule_idx
  on public.auto_message_runs (rule_id, created_at desc);

-- 3. Message columns for auto/Termin messages -------------------------------------
alter table public.messages
  add column if not exists auto_rule_id uuid references public.auto_message_rules(id) on delete set null,
  add column if not exists attendance_id bigint references public.attendance(id) on delete set null,
  add column if not exists allow_responses boolean not null default false,
  add column if not exists vars jsonb,        -- shared placeholder values (termin, datum, …)
  add column if not exists i18n jsonb;        -- template texts per language {de: {title, html, text}}

alter table public.message_recipients
  add column if not exists person_attendance_id uuid,
  add column if not exists vars jsonb,        -- per-person placeholder values (vorname, …)
  add column if not exists lang text;

create index if not exists messages_attendance_idx
  on public.messages (attendance_id) where attendance_id is not null;

-- 4. "Attendance was taken" marker -------------------------------------------------
-- Set whenever an admin/responsible/helper/voice leader changes a status. The
-- cron only sends for Termine with status_recorded_at after the start, so a
-- Termin where nobody took attendance never triggers a message.
alter table public.attendance
  add column if not exists status_recorded_at timestamptz;

create or replace function public.mark_attendance_recorded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.status is not distinct from old.status then
    return new;
  end if;
  if exists (
    select 1
      from public.attendance a
      join public."tenantUsers" tu on tu."tenantId" = a."tenantId"
     where a.id = new.attendance_id
       and tu."userId" = auth.uid()::text
       and tu.role in (1, 4, 5, 8, 9)
  ) then
    update public.attendance set status_recorded_at = now() where id = new.attendance_id;
  end if;
  return new;
end;
$$;

revoke all on function public.mark_attendance_recorded() from public, anon, authenticated;

drop trigger if exists person_attendances_mark_recorded on public.person_attendances;
create trigger person_attendances_mark_recorded
  after update of status on public.person_attendances
  for each row execute function public.mark_attendance_recorded();

-- 5. Member responses ----------------------------------------------------------
create table if not exists public.attendance_responses (
  id uuid primary key default gen_random_uuid(),
  "tenantId" bigint not null,
  attendance_id bigint not null references public.attendance(id) on delete cascade,
  person_attendance_id uuid not null unique,
  player_id bigint references public.player(id) on delete cascade,
  user_id text,
  message_id uuid references public.messages(id) on delete set null,
  kind text not null check (kind in ('reason', 'was_present')),
  reason_code text,
  text text,
  state text not null default 'pending' check (state in ('pending', 'accepted', 'rejected')),
  decided_by text,
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists attendance_responses_attendance_idx
  on public.attendance_responses (attendance_id);
create index if not exists attendance_responses_tenant_pending_idx
  on public.attendance_responses ("tenantId") where state = 'pending';

-- 6. RLS -------------------------------------------------------------------------
alter table public.auto_message_rules enable row level security;
alter table public.auto_message_runs enable row level security;
alter table public.attendance_responses enable row level security;

drop policy if exists "tenant admin manage auto rules" on public.auto_message_rules;
create policy "tenant admin manage auto rules"
  on public.auto_message_rules for all to authenticated
  using (
    "tenantId" in (select "tenantId" from "tenantUsers" where "userId" = auth.uid()::text and role in (1, 5))
  )
  with check (
    "tenantId" in (select "tenantId" from "tenantUsers" where "userId" = auth.uid()::text and role in (1, 5))
  );

drop policy if exists "service_role manage auto rules" on public.auto_message_rules;
create policy "service_role manage auto rules"
  on public.auto_message_rules for all to service_role using (true) with check (true);

drop policy if exists "tenant admin read auto runs" on public.auto_message_runs;
create policy "tenant admin read auto runs"
  on public.auto_message_runs for select to authenticated
  using (
    "tenantId" in (select "tenantId" from "tenantUsers" where "userId" = auth.uid()::text and role in (1, 5))
  );

-- "Diesmal aussetzen": admins may add (and undo) a suspended run before the send.
drop policy if exists "tenant admin suspend auto runs" on public.auto_message_runs;
create policy "tenant admin suspend auto runs"
  on public.auto_message_runs for insert to authenticated
  with check (
    status = 'suspended'
    and "tenantId" in (select "tenantId" from "tenantUsers" where "userId" = auth.uid()::text and role in (1, 5))
    and rule_id in (select id from public.auto_message_rules r where r."tenantId" = auto_message_runs."tenantId")
  );

drop policy if exists "tenant admin unsuspend auto runs" on public.auto_message_runs;
create policy "tenant admin unsuspend auto runs"
  on public.auto_message_runs for delete to authenticated
  using (
    status = 'suspended'
    and "tenantId" in (select "tenantId" from "tenantUsers" where "userId" = auth.uid()::text and role in (1, 5))
  );

drop policy if exists "service_role manage auto runs" on public.auto_message_runs;
create policy "service_role manage auto runs"
  on public.auto_message_runs for all to service_role using (true) with check (true);

drop policy if exists "tenant admin read responses" on public.attendance_responses;
create policy "tenant admin read responses"
  on public.attendance_responses for select to authenticated
  using (
    "tenantId" in (select "tenantId" from "tenantUsers" where "userId" = auth.uid()::text and role in (1, 5))
  );

drop policy if exists "member read own responses" on public.attendance_responses;
create policy "member read own responses"
  on public.attendance_responses for select to authenticated
  using (user_id = auth.uid()::text);

-- Writes go through the attendance-response Edge Function only.
drop policy if exists "service_role manage responses" on public.attendance_responses;
create policy "service_role manage responses"
  on public.attendance_responses for all to service_role using (true) with check (true);

-- 7. Cron (create only after testing the function by hand) ------------------------
-- SELECT cron.unschedule('send-auto-messages-job')
-- WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-auto-messages-job');
--
-- SELECT cron.schedule('send-auto-messages-job', '*/15 * * * *', $$
--   select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-auto-messages',
--     headers := jsonb_build_object(
--       'Content-type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
--     ),
--     body := '{}'::jsonb
--   );
-- $$);
