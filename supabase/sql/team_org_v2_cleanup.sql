-- ============================================================
-- Teamorganisation v2 – Aufräumen (im Supabase SQL Editor ausführen)
-- Die neuen Policies, Funktionen und Trigger aus team_org_v2_schema.sql
-- sind bereits eingespielt. Dieser Teil entfernt nur noch die alten
-- Policies, die sonst allen Mitgliedern Lesezugriff auf Entwürfe,
-- Themen und Aufgaben geben, sowie die nicht mehr benötigte Struktur.
-- Erneutes Ausführen ist unschädlich.
-- ============================================================
DROP POLICY IF EXISTS "tenant members can read agenda items" ON public.agenda_items;
DROP POLICY IF EXISTS "admins can insert agenda items" ON public.agenda_items;
DROP POLICY IF EXISTS "admins can update agenda items" ON public.agenda_items;
DROP POLICY IF EXISTS "admins can delete agenda items" ON public.agenda_items;

DROP POLICY IF EXISTS "tenant members can read protocols" ON public.protocols;
DROP POLICY IF EXISTS "admins can insert protocols" ON public.protocols;
DROP POLICY IF EXISTS "admins can update protocols" ON public.protocols;
DROP POLICY IF EXISTS "admins can delete protocols" ON public.protocols;

DROP POLICY IF EXISTS "tenant members can read tasks" ON public.tasks;
DROP POLICY IF EXISTS "admins can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "admins can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "admins can delete tasks" ON public.tasks;

DROP TABLE IF EXISTS public.agenda_item_attendances;
ALTER TABLE public.agenda_items DROP COLUMN IF EXISTS due_date;
