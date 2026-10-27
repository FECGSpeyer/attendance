-- ============================================================
-- Dienstplan (Dienst-Modus für Termintypen)
-- Sollzahl, Einteilung mit Bestätigung, Selbst-Eintragen,
-- Unterbesetzt-/Dringend-Benachrichtigung, regelmäßig verhindert.
--
-- Im Supabase SQL Editor ausführen. Erneutes Ausführen ist unschädlich.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Termintyp
-- ------------------------------------------------------------
ALTER TABLE attendance_types
  ADD COLUMN IF NOT EXISTS duty_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duty_required integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS duty_self_signup boolean NOT NULL DEFAULT true,
  -- Erinnerung an unbestätigte Einteilungen nach X Tagen (null = aus)
  ADD COLUMN IF NOT EXISTS duty_confirm_reminder_days integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS duty_notify_understaffed boolean NOT NULL DEFAULT true,
  -- Dringende Benachrichtigung X Stunden vor Beginn, wenn unterbesetzt (null = aus)
  ADD COLUMN IF NOT EXISTS duty_urgent_hours integer;

-- ------------------------------------------------------------
-- 2. Termin
-- ------------------------------------------------------------
ALTER TABLE attendance
  -- Sollzahl für diesen Termin (null = Wert vom Typ)
  ADD COLUMN IF NOT EXISTS duty_required integer,
  -- Zeitpunkt der dringenden Benachrichtigung (einmalig)
  ADD COLUMN IF NOT EXISTS duty_urgent_sent_at timestamptz,
  -- Unterbesetzt-Benachrichtigung wurde verschickt; beim Wieder-Besetzen
  -- geht "Dienst ist wieder besetzt" raus und das Feld wird geleert.
  ADD COLUMN IF NOT EXISTS duty_alert_sent_at timestamptz;

-- ------------------------------------------------------------
-- 3. Einteilung pro Person
-- ------------------------------------------------------------
ALTER TABLE person_attendances
  ADD COLUMN IF NOT EXISTS duty_state text,
  ADD COLUMN IF NOT EXISTS duty_assigned_by text,
  ADD COLUMN IF NOT EXISTS duty_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS duty_reminder_sent boolean NOT NULL DEFAULT false;

ALTER TABLE person_attendances DROP CONSTRAINT IF EXISTS person_attendances_duty_state_check;
ALTER TABLE person_attendances ADD CONSTRAINT person_attendances_duty_state_check
  CHECK (duty_state IS NULL OR duty_state IN ('requested', 'confirmed', 'self'));

CREATE INDEX IF NOT EXISTS person_attendances_duty_state_idx
  ON person_attendances (duty_state) WHERE duty_state IS NOT NULL;

-- ------------------------------------------------------------
-- 4. Benachrichtigungs-Schalter "Dienste" (null = an)
-- ------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS duties boolean;

-- ------------------------------------------------------------
-- 5. Selbst eintragen: atomar, damit bei zwei gleichzeitigen
--    "Ich übernehme" nur einer den letzten Platz bekommt.
--    Rückgabe: 'ok' | 'full' | 'not_member' | 'not_allowed' | 'past'
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.duty_take(p_attendance_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_att attendance%ROWTYPE;
  v_type attendance_types%ROWTYPE;
  v_pa_id uuid;
  v_required integer;
  v_taken integer;
BEGIN
  SELECT * INTO v_att FROM attendance WHERE id = p_attendance_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_member';
  END IF;

  SELECT * INTO v_type FROM attendance_types WHERE id = v_att.type_id;
  IF NOT FOUND OR NOT v_type.duty_mode OR NOT v_type.duty_self_signup THEN
    RETURN 'not_allowed';
  END IF;

  IF v_att.date < now() - interval '1 day' THEN
    RETURN 'past';
  END IF;

  SELECT pa.id INTO v_pa_id
  FROM person_attendances pa
  JOIN player p ON p.id = pa.person_id
  WHERE pa.attendance_id = p_attendance_id
    AND p."appId" = auth.uid()
  LIMIT 1;
  IF v_pa_id IS NULL THEN
    RETURN 'not_member';
  END IF;

  v_required := COALESCE(v_att.duty_required, v_type.duty_required, 1);
  SELECT count(*) INTO v_taken
  FROM person_attendances
  WHERE attendance_id = p_attendance_id
    AND duty_state IS NOT NULL
    AND status NOT IN (2, 4, 5)
    AND id <> v_pa_id;
  IF v_taken >= v_required THEN
    RETURN 'full';
  END IF;

  UPDATE person_attendances
  SET duty_state = 'self',
      status = 1,
      notes = '',
      duty_assigned_by = auth.uid()::text,
      duty_assigned_at = now(),
      duty_reminder_sent = true,
      changed_by = auth.uid(),
      changed_at = now()
  WHERE id = v_pa_id;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.duty_take(bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.duty_take(bigint) TO authenticated;

-- ------------------------------------------------------------
-- 6. Regelmäßig verhindert (Wochentag-Regeln pro Person)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS person_unavailability (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  person_id   bigint NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  -- ISO-Wochentage 1 = Montag … 7 = Sonntag
  weekdays    smallint[] NOT NULL,
  -- leer = gilt für alle Termintypen
  type_ids    uuid[] NOT NULL DEFAULT '{}',
  reason      text NOT NULL DEFAULT '',
  valid_until date
);

CREATE INDEX IF NOT EXISTS person_unavailability_tenant_idx ON person_unavailability (tenant_id);
CREATE INDEX IF NOT EXISTS person_unavailability_person_idx ON person_unavailability (person_id);

ALTER TABLE person_unavailability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant members can read unavailability" ON person_unavailability;
CREATE POLICY "tenant members can read unavailability"
  ON person_unavailability FOR SELECT
  USING (
    tenant_id IN (SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text)
  );

DROP POLICY IF EXISTS "leaders or self can write unavailability" ON person_unavailability;
CREATE POLICY "leaders or self can write unavailability"
  ON person_unavailability FOR ALL
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND (
          role IN (1, 5)
          OR EXISTS (
            SELECT 1 FROM player p
            WHERE p.id = person_unavailability.person_id
              AND p."appId" = auth.uid()
          )
        )
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text
        AND (
          role IN (1, 5)
          OR EXISTS (
            SELECT 1 FROM player p
            WHERE p.id = person_unavailability.person_id
              AND p."appId" = auth.uid()
          )
        )
    )
  );

-- ------------------------------------------------------------
-- 7. Cron: Erinnerung an unbestätigte Dienste + dringende Stufe
-- ------------------------------------------------------------
SELECT cron.unschedule('send-duty-reminders-job')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-duty-reminders-job');

SELECT cron.schedule('send-duty-reminders-job', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-duty-reminders',
    headers := jsonb_build_object(
      'Content-type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key')
    ),
    body := '{}'::jsonb
  );
$$);

-- ------------------------------------------------------------
-- 8. Instanz-Schalter: "Meine Termine" als Dienstplan-Ansicht
-- ------------------------------------------------------------
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS duty_view boolean NOT NULL DEFAULT false;
