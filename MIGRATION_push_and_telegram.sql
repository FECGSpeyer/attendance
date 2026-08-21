ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_and_telegram BOOLEAN NOT NULL DEFAULT false;
