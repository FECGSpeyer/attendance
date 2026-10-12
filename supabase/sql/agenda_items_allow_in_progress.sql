-- Allow 'in_progress' as agenda item status (offered by the UI)
ALTER TABLE public.agenda_items DROP CONSTRAINT IF EXISTS agenda_items_status_check;
ALTER TABLE public.agenda_items ADD CONSTRAINT agenda_items_status_check
  CHECK (status IN ('open', 'in_progress', 'completed', 'postponed'));
