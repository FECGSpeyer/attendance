-- usage_events: lightweight, tenant-anonymous event log for the super-developer dashboard.
-- Insertable by any authenticated user; readable only by developer@attendix.de via JWT claim.

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null,
  tenant_id bigint,
  device_type text,
  properties jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_created_at_idx
  on public.usage_events (created_at desc);

create index if not exists usage_events_event_name_created_at_idx
  on public.usage_events (event_name, created_at desc);

alter table public.usage_events enable row level security;

drop policy if exists "authenticated can insert usage events" on public.usage_events;
create policy "authenticated can insert usage events"
  on public.usage_events for insert to authenticated
  with check (true);

drop policy if exists "super developer can read usage events" on public.usage_events;
create policy "super developer can read usage events"
  on public.usage_events for select to authenticated
  using (auth.jwt() ->> 'email' = 'developer@attendix.de');
