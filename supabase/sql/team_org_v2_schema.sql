-- ============================================================
-- Teamorganisation v2
-- Tagesordnung im Ablaufplan, Protokolle mit Freigabe, Aufgaben
-- für alle Personen, Themenvorschläge von Mitgliedern.
--
-- Im Supabase SQL Editor ausführen. Erneutes Ausführen ist unschädlich.
-- Die alte Teamorganisation wurde in Prod nicht genutzt, deshalb gibt
-- es keine Datenmigration von agenda_item_attendances.
-- `meetings` bleibt unverändert.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Neue Spalten
-- ------------------------------------------------------------
ALTER TABLE attendance_types
  ADD COLUMN IF NOT EXISTS agenda_default_duration integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS suggest_postponed boolean NOT NULL DEFAULT true;

ALTER TABLE public.agenda_items
  ADD COLUMN IF NOT EXISTS default_duration integer,
  ADD COLUMN IF NOT EXISTS proposed_by bigint REFERENCES player(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proposal_status text,
  ADD COLUMN IF NOT EXISTS decision_note text;

UPDATE public.agenda_items SET status = 'open' WHERE status IN ('in_progress', 'postponed');

ALTER TABLE public.agenda_items DROP CONSTRAINT IF EXISTS agenda_items_status_check;
ALTER TABLE public.agenda_items ADD CONSTRAINT agenda_items_status_check
  CHECK (status IN ('open', 'completed', 'dropped'));

ALTER TABLE public.agenda_items DROP CONSTRAINT IF EXISTS agenda_items_proposal_status_check;
ALTER TABLE public.agenda_items ADD CONSTRAINT agenda_items_proposal_status_check
  CHECK (proposal_status IS NULL OR proposal_status IN ('pending', 'accepted', 'rejected'));

-- Einmalige Datenübernahme nur beim ersten Lauf (wenn die Spalten neu
-- angelegt werden). Ein erneuter Lauf veröffentlicht keine Entwürfe und
-- ändert keine Erinnerungs-Markierungen.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'protocols' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.protocols ADD COLUMN status text NOT NULL DEFAULT 'draft';
    -- Bestehende (aus den Besprechungen migrierte) Protokolle gelten als freigegeben.
    ALTER TABLE public.protocols ADD COLUMN IF NOT EXISTS published_at timestamptz;
    UPDATE public.protocols SET status = 'published', published_at = updated_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'overdue_reminder_sent'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN overdue_reminder_sent boolean NOT NULL DEFAULT false;
    -- Bereits überfällige Aufgaben nicht nachträglich anmahnen.
    UPDATE public.tasks SET overdue_reminder_sent = true
      WHERE due_date < current_date AND status <> 'completed';
  END IF;
END $$;

ALTER TABLE public.protocols
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS outcomes jsonb NOT NULL DEFAULT '{}';

ALTER TABLE public.protocols DROP CONSTRAINT IF EXISTS protocols_status_check;
ALTER TABLE public.protocols ADD CONSTRAINT protocols_status_check
  CHECK (status IN ('draft', 'published'));

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

UPDATE public.tasks SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL;

-- ------------------------------------------------------------
-- 2. Hilfsfunktionen (SECURITY DEFINER, damit RLS-Policies sie
--    ohne Rekursion nutzen können)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_tenant_leader(p_tenant_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "tenantUsers"
    WHERE "tenantId" = p_tenant_id
      AND "userId" = auth.uid()::text
      AND role IN (1, 5)
  );
$$;

CREATE OR REPLACE FUNCTION public.my_player_ids(p_tenant_id bigint)
RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM player
  WHERE "tenantId" = p_tenant_id
    AND "appId" = auth.uid();
$$;

-- Personenkreis eines Termintyps: Person in einer relevanten Gruppe des
-- Typs (ohne Gruppen: alle Personen der Instanz). Eltern und Bewerber nie.
-- Die Leitung gehört immer dazu.
CREATE OR REPLACE FUNCTION public.in_protocol_circle(p_type_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM attendance_types t
    JOIN "tenantUsers" tu
      ON tu."tenantId" = t.tenant_id AND tu."userId" = auth.uid()::text
    WHERE t.id = p_type_id
      AND t.enable_protocol
      AND (
        tu.role IN (1, 5)
        OR (
          tu.role NOT IN (6, 7)
          AND EXISTS (
            SELECT 1 FROM player p
            WHERE p."tenantId" = t.tenant_id
              AND p."appId" = auth.uid()
              AND p."left" IS NULL
              AND (
                COALESCE(array_length(t.relevant_groups, 1), 0) = 0
                OR p.instrument = ANY (t.relevant_groups)
              )
          )
        )
      )
  );
$$;

-- Gehört die Person zum Personenkreis mindestens eines aktiven Typs?
CREATE OR REPLACE FUNCTION public.in_any_protocol_circle(p_tenant_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM attendance_types t
    WHERE t.tenant_id = p_tenant_id
      AND t.enable_protocol
      AND public.in_protocol_circle(t.id)
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_protocol(p_attendance_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM attendance a
    WHERE a.id = p_attendance_id
      AND public.in_protocol_circle(a.type_id)
  );
$$;

-- ------------------------------------------------------------
-- 3. Protokoll: Abschnittsweise speichern und freigeben
-- ------------------------------------------------------------
-- Speichert genau einen Abschnitt (Notiz und/oder Ergebnis), damit
-- mehrere Schreibende sich nicht gegenseitig überschreiben.
CREATE OR REPLACE FUNCTION public.save_protocol_section(
  p_attendance_id bigint,
  p_field_id text,
  p_doc jsonb DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_clear_outcome boolean DEFAULT false
)
RETURNS public.protocols
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant bigint;
  v_row public.protocols;
BEGIN
  SELECT "tenantId" INTO v_tenant FROM attendance WHERE id = p_attendance_id;
  IF v_tenant IS NULL OR NOT public.is_tenant_leader(v_tenant) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_outcome IS NOT NULL AND p_outcome NOT IN ('discussed', 'decided', 'postponed') THEN
    RAISE EXCEPTION 'invalid outcome';
  END IF;

  INSERT INTO public.protocols (attendance_id, tenant_id, content, created_by)
  VALUES (p_attendance_id, v_tenant, '{}', auth.uid())
  ON CONFLICT (attendance_id) DO NOTHING;

  UPDATE public.protocols SET
    content = CASE WHEN p_doc IS NULL THEN content
                   ELSE jsonb_set(content, ARRAY[p_field_id], p_doc, true) END,
    outcomes = CASE
                 WHEN p_clear_outcome THEN outcomes - p_field_id
                 WHEN p_outcome IS NULL THEN outcomes
                 ELSE jsonb_set(outcomes, ARRAY[p_field_id], to_jsonb(p_outcome), true) END,
    updated_at = now()
  WHERE attendance_id = p_attendance_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_protocol(p_attendance_id bigint)
RETURNS public.protocols
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant bigint;
  v_row public.protocols;
BEGIN
  SELECT "tenantId" INTO v_tenant FROM attendance WHERE id = p_attendance_id;
  IF v_tenant IS NULL OR NOT public.is_tenant_leader(v_tenant) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.protocols (attendance_id, tenant_id, content, created_by)
  VALUES (p_attendance_id, v_tenant, '{}', auth.uid())
  ON CONFLICT (attendance_id) DO NOTHING;

  UPDATE public.protocols SET
    status = 'published',
    published_at = now(),
    published_by = auth.uid(),
    updated_at = now()
  WHERE attendance_id = p_attendance_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Verlauf eines Themas: alle Termine, in deren Ablaufplan das Thema
-- als TOP steht, mit dem Ergebnis aus dem Protokoll.
CREATE OR REPLACE FUNCTION public.get_agenda_item_history(p_agenda_item_id uuid)
RETURNS TABLE (
  attendance_id bigint,
  date timestamptz,
  type_id uuid,
  type_info text,
  field_id text,
  outcome text,
  protocol_status text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT a.id, a.date, a.type_id, a."typeInfo", f->>'id', pr.outcomes->>(f->>'id'), pr.status
  FROM public.agenda_items ai
  JOIN attendance a ON a."tenantId" = ai.tenant_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(a.plan->'fields') = 'array' THEN a.plan->'fields' ELSE '[]'::jsonb END
  ) f
  LEFT JOIN public.protocols pr ON pr.attendance_id = a.id
  WHERE ai.id = p_agenda_item_id
    AND public.is_tenant_leader(ai.tenant_id)
    AND f->>'agendaItemId' = p_agenda_item_id::text
  ORDER BY a.date DESC;
$$;

-- ------------------------------------------------------------
-- 4. Aufgaben: Mitglieder dürfen nur Status ändern
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tasks_guard_member_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_tenant_leader(OLD.tenant_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.responsible_person_id IS DISTINCT FROM OLD.responsible_person_id
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.agenda_item_id IS DISTINCT FROM OLD.agenda_item_id
     OR NEW.protocol_id IS DISTINCT FROM OLD.protocol_id
     OR NEW.attendance_id IS DISTINCT FROM OLD.attendance_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Nur der Status darf geändert werden' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_guard_member_update ON public.tasks;
CREATE TRIGGER tasks_guard_member_update
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_guard_member_update();

-- completed_at automatisch pflegen
CREATE OR REPLACE FUNCTION public.tasks_set_completed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'completed' THEN
    NEW.completed_at := NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    NEW.reminder_sent := false;
    NEW.overdue_reminder_sent := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_set_completed_at ON public.tasks;
CREATE TRIGGER tasks_set_completed_at
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_set_completed_at();

-- ------------------------------------------------------------
-- 5. RLS-Policies neu
-- ------------------------------------------------------------
-- agenda_items
DROP POLICY IF EXISTS "tenant members can read agenda items" ON public.agenda_items;
DROP POLICY IF EXISTS "admins can insert agenda items" ON public.agenda_items;
DROP POLICY IF EXISTS "admins can update agenda items" ON public.agenda_items;
DROP POLICY IF EXISTS "admins can delete agenda items" ON public.agenda_items;
DROP POLICY IF EXISTS "agenda_items_select" ON public.agenda_items;
DROP POLICY IF EXISTS "agenda_items_insert" ON public.agenda_items;
DROP POLICY IF EXISTS "agenda_items_update" ON public.agenda_items;
DROP POLICY IF EXISTS "agenda_items_delete" ON public.agenda_items;

CREATE POLICY "agenda_items_select" ON public.agenda_items FOR SELECT
  USING (
    public.is_tenant_leader(tenant_id)
    OR proposed_by IN (SELECT public.my_player_ids(tenant_id))
  );

CREATE POLICY "agenda_items_insert" ON public.agenda_items FOR INSERT
  WITH CHECK (
    public.is_tenant_leader(tenant_id)
    OR (
      proposal_status = 'pending'
      AND status = 'open'
      AND proposed_by IN (SELECT public.my_player_ids(tenant_id))
      AND public.in_any_protocol_circle(tenant_id)
    )
  );

CREATE POLICY "agenda_items_update" ON public.agenda_items FOR UPDATE
  USING (public.is_tenant_leader(tenant_id))
  WITH CHECK (public.is_tenant_leader(tenant_id));

CREATE POLICY "agenda_items_delete" ON public.agenda_items FOR DELETE
  USING (
    public.is_tenant_leader(tenant_id)
    OR (
      proposal_status = 'pending'
      AND proposed_by IN (SELECT public.my_player_ids(tenant_id))
    )
  );

-- protocols
DROP POLICY IF EXISTS "tenant members can read protocols" ON public.protocols;
DROP POLICY IF EXISTS "admins can insert protocols" ON public.protocols;
DROP POLICY IF EXISTS "admins can update protocols" ON public.protocols;
DROP POLICY IF EXISTS "admins can delete protocols" ON public.protocols;
DROP POLICY IF EXISTS "protocols_select" ON public.protocols;
DROP POLICY IF EXISTS "protocols_insert" ON public.protocols;
DROP POLICY IF EXISTS "protocols_update" ON public.protocols;
DROP POLICY IF EXISTS "protocols_delete" ON public.protocols;

CREATE POLICY "protocols_select" ON public.protocols FOR SELECT
  USING (
    public.is_tenant_leader(tenant_id)
    OR (status = 'published' AND public.can_read_protocol(attendance_id))
  );

CREATE POLICY "protocols_insert" ON public.protocols FOR INSERT
  WITH CHECK (public.is_tenant_leader(tenant_id));

CREATE POLICY "protocols_update" ON public.protocols FOR UPDATE
  USING (public.is_tenant_leader(tenant_id))
  WITH CHECK (public.is_tenant_leader(tenant_id));

CREATE POLICY "protocols_delete" ON public.protocols FOR DELETE
  USING (public.is_tenant_leader(tenant_id));

-- tasks
DROP POLICY IF EXISTS "tenant members can read tasks" ON public.tasks;
DROP POLICY IF EXISTS "admins can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "admins can update tasks" ON public.tasks;
DROP POLICY IF EXISTS "admins can delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;

CREATE POLICY "tasks_select" ON public.tasks FOR SELECT
  USING (
    public.is_tenant_leader(tenant_id)
    OR responsible_person_id IN (SELECT public.my_player_ids(tenant_id))
  );

CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT
  WITH CHECK (public.is_tenant_leader(tenant_id));

CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE
  USING (
    public.is_tenant_leader(tenant_id)
    OR responsible_person_id IN (SELECT public.my_player_ids(tenant_id))
  )
  WITH CHECK (
    public.is_tenant_leader(tenant_id)
    OR responsible_person_id IN (SELECT public.my_player_ids(tenant_id))
  );

CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE
  USING (public.is_tenant_leader(tenant_id));

-- ------------------------------------------------------------
-- 6. Rechte für die Funktionen
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.save_protocol_section(bigint, text, jsonb, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_protocol(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_agenda_item_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_protocol_section(bigint, text, jsonb, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_protocol(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agenda_item_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_leader(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_player_ids(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.in_protocol_circle(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.in_any_protocol_circle(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_protocol(bigint) TO authenticated;

-- ------------------------------------------------------------
-- 7. Alte, nicht mehr benötigte Struktur der Teamorganisation
-- ------------------------------------------------------------
-- Tagesordnungspunkte stehen jetzt als Felder im Ablaufplan
-- (attendance.plan.fields[].agendaItemId).
DROP TABLE IF EXISTS public.agenda_item_attendances;
-- Die Fälligkeit eines Themas ergibt sich aus dem Termin, in dem es eingeplant ist.
ALTER TABLE public.agenda_items DROP COLUMN IF EXISTS due_date;
