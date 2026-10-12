-- player.id is bigint; responsible_person_id must match
ALTER TABLE public.agenda_items ALTER COLUMN responsible_person_id TYPE bigint;
ALTER TABLE public.tasks ALTER COLUMN responsible_person_id TYPE bigint;
