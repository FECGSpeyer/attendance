-- Termin cards posted by @attendix_bot in Telegram chats (attendix-bot Edge Function).
-- One row per posted message, so the bot can update the counts after every tap.
-- Service role only: RLS on, no policies.

create table if not exists public.telegram_cards (
  id bigint generated always as identity primary key,
  key text not null unique,
  attendance_id bigint not null references public.attendance(id) on delete cascade,
  tenant_id bigint not null,
  chat_id bigint not null,
  message_id bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_cards_attendance_idx on public.telegram_cards (attendance_id);

alter table public.telegram_cards enable row level security;
