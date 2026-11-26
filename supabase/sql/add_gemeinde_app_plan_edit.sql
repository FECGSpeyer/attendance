-- Gemeinde App, Phase 3: Ablaufpläne in der Gemeinde App bearbeiten.
-- Voraussetzung: add_gemeinde_app_write.sql.
--
-- Die Gemeinde App schreibt über die Edge Function fecg-bridge. Die Bridge liest
-- den Plan, wendet die Änderung an und speichert nur, wenn der Plan seitdem
-- unverändert ist (compare-and-swap). Sonst liest sie neu und versucht es noch
-- einmal; ändert jemand denselben Punkt, meldet sie einen Konflikt.
--
-- Neu:
--   * Plan-Kennzeichen `unpublished` (attendance: im Plan-JSON, shared_plans: Spalte).
--     Unveröffentlichte Pläne bleiben nur im Editor sichtbar.
--   * fecg_cas_attendance_plans, fecg_cas_shared_plan, fecg_cas_org_planning:
--     Schreiben nur, wenn der alte Stand noch gilt. Nur für service_role.
--   * Webhook an die Gemeinde App bei jeder Änderung eines ORG-Plans
--     (tenant_groups.gemeinde_app_webhook_url, pg_net). Der Aufruf trägt nur die
--     Organisation, die Gemeinde App holt den Plan dann selbst über die Bridge.

ALTER TABLE shared_plans ADD COLUMN IF NOT EXISTS unpublished boolean NOT NULL DEFAULT false;
ALTER TABLE tenant_groups ADD COLUMN IF NOT EXISTS gemeinde_app_webhook_url text;

-- Alle Pläne eines Termins als Liste: [plan, ...extra_plans] (leer, wenn keiner).
CREATE OR REPLACE FUNCTION fecg_attendance_plan_list(p_plan jsonb, p_extra jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_plan IS NULL OR jsonb_typeof(p_plan) <> 'object' THEN '[]'::jsonb
              ELSE jsonb_build_array(p_plan) END
         || CASE WHEN jsonb_typeof(p_extra) = 'array' THEN p_extra ELSE '[]'::jsonb END
$$;

-- Termin: alle Pläne ersetzen, wenn sie noch p_old entsprechen. p_new leer = keiner mehr.
CREATE OR REPLACE FUNCTION fecg_cas_attendance_plans(
  p_attendance_id bigint,
  p_old jsonb,
  p_new jsonb
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_plan jsonb;
  v_extra jsonb;
  v_count int;
BEGIN
  SELECT plan, extra_plans INTO v_plan, v_extra FROM attendance WHERE id = p_attendance_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF fecg_attendance_plan_list(v_plan, v_extra) IS DISTINCT FROM p_old THEN RETURN false; END IF;
  IF p_new IS NULL OR jsonb_typeof(p_new) <> 'array' THEN RETURN false; END IF;

  PERFORM set_config('fecg.beamer_write', 'on', true);
  v_count := jsonb_array_length(p_new);
  UPDATE attendance SET
    plan = CASE WHEN v_count = 0 THEN NULL ELSE p_new->0 END,
    extra_plans = CASE WHEN v_count <= 1 THEN NULL ELSE p_new - 0 END
  WHERE id = p_attendance_id;
  PERFORM set_config('fecg.beamer_write', 'off', true);
  RETURN true;
END;
$$;

-- Freier ORG-Plan als JSON im selben Format wie ein Plan am Termin.
CREATE OR REPLACE FUNCTION fecg_shared_plan_json(s shared_plans)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'title', s.plan_title,
    'date', s.date,
    'time', s.time,
    'end', s.end_time,
    'fields', coalesce(s.fields, '[]'::jsonb),
    'unpublished', coalesce(s.unpublished, false)
  )
$$;

-- Freier ORG-Plan: ersetzen, wenn er noch p_old entspricht. p_new NULL = löschen.
CREATE OR REPLACE FUNCTION fecg_cas_shared_plan(
  p_id text,
  p_org_id bigint,
  p_old jsonb,
  p_new jsonb
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_row shared_plans;
BEGIN
  SELECT * INTO v_row FROM shared_plans WHERE id = p_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF fecg_shared_plan_json(v_row) IS DISTINCT FROM p_old THEN RETURN false; END IF;

  IF p_new IS NULL THEN
    DELETE FROM shared_plans WHERE id = p_id;
    RETURN true;
  END IF;

  PERFORM set_config('fecg.beamer_write', 'on', true);
  UPDATE shared_plans SET
    plan_title = p_new->>'title',
    date = coalesce(p_new->>'date', date),
    time = p_new->>'time',
    end_time = p_new->>'end',
    fields = coalesce(p_new->'fields', '[]'::jsonb),
    unpublished = coalesce((p_new->>'unpublished')::boolean, false)
  WHERE id = p_id;
  PERFORM set_config('fecg.beamer_write', 'off', true);
  RETURN true;
END;
$$;

-- Planvorlagen (planning_templates) oder Felder (default_fields) der Organisation.
CREATE OR REPLACE FUNCTION fecg_cas_org_planning(
  p_org_id bigint,
  p_column text,
  p_old jsonb,
  p_new jsonb
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_current jsonb;
BEGIN
  IF p_column NOT IN ('planning_templates', 'default_fields') THEN RETURN false; END IF;
  IF p_new IS NULL OR jsonb_typeof(p_new) <> 'array' THEN RETURN false; END IF;
  EXECUTE format('SELECT %I FROM tenant_groups WHERE id = $1 FOR UPDATE', p_column)
    INTO v_current USING p_org_id;
  IF coalesce(v_current, '[]'::jsonb) IS DISTINCT FROM coalesce(p_old, '[]'::jsonb) THEN RETURN false; END IF;
  EXECUTE format('UPDATE tenant_groups SET %I = $1 WHERE id = $2', p_column) USING p_new, p_org_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION fecg_cas_attendance_plans(bigint, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fecg_cas_shared_plan(text, bigint, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fecg_cas_org_planning(bigint, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fecg_cas_attendance_plans(bigint, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION fecg_cas_shared_plan(text, bigint, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION fecg_cas_org_planning(bigint, text, jsonb, jsonb) TO service_role;

-- Webhook: Gemeinde App sofort über Änderungen an ORG-Plänen informieren.
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION fecg_notify_gemeinde_app() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org bigint;
  v_url text;
BEGIN
  IF TG_TABLE_NAME = 'attendance' THEN
    IF NOT (coalesce(NEW.is_org_plan, false) OR (TG_OP <> 'INSERT' AND coalesce(OLD.is_org_plan, false))) THEN
      RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.plan IS NOT DISTINCT FROM OLD.plan
       AND NEW.extra_plans IS NOT DISTINCT FROM OLD.extra_plans
       AND NEW.is_org_plan IS NOT DISTINCT FROM OLD.is_org_plan
       AND NEW.date IS NOT DISTINCT FROM OLD.date
       AND NEW.archived IS NOT DISTINCT FROM OLD.archived THEN
      RETURN NULL;
    END IF;
    SELECT tenant_group INTO v_org FROM tenant_group_tenants
      WHERE tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD."tenantId" ELSE NEW."tenantId" END
      LIMIT 1;
  ELSE
    v_org := CASE WHEN TG_OP = 'DELETE' THEN OLD.org_id ELSE NEW.org_id END;
  END IF;
  IF v_org IS NULL THEN RETURN NULL; END IF;

  SELECT gemeinde_app_webhook_url INTO v_url FROM tenant_groups WHERE id = v_org AND fecg_link_enabled = true;
  IF coalesce(v_url, '') = '' THEN RETURN NULL; END IF;

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('org', v_org, 'table', TG_TABLE_NAME),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Ein Fehler beim Benachrichtigen darf das Speichern nie verhindern.
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS attendance_notify_gemeinde_app ON attendance;
CREATE TRIGGER attendance_notify_gemeinde_app
  AFTER INSERT OR UPDATE OR DELETE ON attendance
  FOR EACH ROW EXECUTE FUNCTION fecg_notify_gemeinde_app();

DROP TRIGGER IF EXISTS shared_plans_notify_gemeinde_app ON shared_plans;
CREATE TRIGGER shared_plans_notify_gemeinde_app
  AFTER INSERT OR UPDATE OR DELETE ON shared_plans
  FOR EACH ROW EXECUTE FUNCTION fecg_notify_gemeinde_app();

-- Danach je Organisation einmal setzen (Adresse aus der Gemeinde App, Verwaltung):
-- UPDATE tenant_groups SET gemeinde_app_webhook_url = 'https://…/api/worship/attendix/ping' WHERE id = …;
