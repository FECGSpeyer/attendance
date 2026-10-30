-- Gemeinde App, Phase 2: Beamer-Dateien an Programmpunkte und Werke hängen.
-- Voraussetzung: add_gemeinde_app_link.sql.
--
-- Attendix speichert einen Plan immer als Ganzes. Damit das Speichern in Attendix
-- die Dateien nicht überschreibt, die die Gemeinde App inzwischen verknüpft hat,
-- übernimmt ein Trigger `beamerFile` je Programmpunkt (uid) aus dem alten Stand.
-- Ändern darf es nur fecg_set_beamer_file (die Edge Function fecg-bridge).

-- Felder eines Plans: beamerFile aus dem alten Stand je uid; neue Punkte haben keine.
CREATE OR REPLACE FUNCTION fecg_keep_beamer_files(old_fields jsonb, new_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  files jsonb := '{}';
  f jsonb;
  result jsonb := '[]';
BEGIN
  IF new_fields IS NULL OR jsonb_typeof(new_fields) <> 'array' THEN
    RETURN new_fields;
  END IF;
  IF old_fields IS NOT NULL AND jsonb_typeof(old_fields) = 'array' THEN
    FOR f IN SELECT value FROM jsonb_array_elements(old_fields) LOOP
      IF coalesce(f->>'uid', '') <> '' AND jsonb_typeof(f->'beamerFile') = 'object' THEN
        files := files || jsonb_build_object(f->>'uid', f->'beamerFile');
      END IF;
    END LOOP;
  END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(new_fields) LOOP
    IF coalesce(f->>'uid', '') <> '' AND files ? (f->>'uid') THEN
      f := f || jsonb_build_object('beamerFile', files->(f->>'uid'));
    ELSE
      f := f - 'beamerFile';
    END IF;
    result := result || jsonb_build_array(f);
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION fecg_keep_plan_beamer(old_plan jsonb, new_plan jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN new_plan IS NULL OR jsonb_typeof(new_plan) <> 'object' OR NOT new_plan ? 'fields' THEN new_plan
    ELSE jsonb_set(new_plan, '{fields}', fecg_keep_beamer_files(old_plan->'fields', new_plan->'fields'))
  END
$$;

CREATE OR REPLACE FUNCTION fecg_attendance_keep_beamer() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_plan jsonb;
  old_extra jsonb;
BEGIN
  IF current_setting('fecg.beamer_write', true) = 'on' OR NOT coalesce(NEW.is_org_plan, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    old_plan := OLD.plan;
    old_extra := OLD.extra_plans;
  END IF;
  IF NEW.plan IS DISTINCT FROM old_plan THEN
    NEW.plan := fecg_keep_plan_beamer(old_plan, NEW.plan);
  END IF;
  IF NEW.extra_plans IS DISTINCT FROM old_extra AND jsonb_typeof(NEW.extra_plans) = 'array' THEN
    SELECT coalesce(jsonb_agg(fecg_keep_plan_beamer(old_extra->((e.i - 1)::int), e.p) ORDER BY e.i), '[]')
      INTO NEW.extra_plans
      FROM jsonb_array_elements(NEW.extra_plans) WITH ORDINALITY AS e(p, i);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS attendance_keep_beamer ON attendance;
CREATE TRIGGER attendance_keep_beamer
  BEFORE INSERT OR UPDATE OF plan, extra_plans ON attendance
  FOR EACH ROW EXECUTE FUNCTION fecg_attendance_keep_beamer();

CREATE OR REPLACE FUNCTION fecg_shared_plan_keep_beamer() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  old_fields jsonb;
BEGIN
  IF current_setting('fecg.beamer_write', true) = 'on' OR NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    old_fields := OLD.fields;
  END IF;
  IF NEW.fields IS DISTINCT FROM old_fields THEN
    NEW.fields := fecg_keep_beamer_files(old_fields, NEW.fields);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shared_plans_keep_beamer ON shared_plans;
CREATE TRIGGER shared_plans_keep_beamer
  BEFORE INSERT OR UPDATE OF fields ON shared_plans
  FOR EACH ROW EXECUTE FUNCTION fecg_shared_plan_keep_beamer();

-- Datei an einen Punkt hängen (p_file NULL = lösen). Der Punkt wird über seine uid
-- gefunden; Punkte ohne uid über dieselbe Ersatz-Kennung wie in fecg-bridge
-- (id, bei Wiederholung id#2 …). Die uid wird dabei fest am Punkt gespeichert.
-- Liefert NULL, wenn es den Punkt nicht gibt.
CREATE OR REPLACE FUNCTION fecg_link_field(fields jsonb, p_uid text, p_file jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  f jsonb;
  seen jsonb := '{}';
  n int;
  key text;
  result jsonb := '[]';
  hit boolean := false;
BEGIN
  IF fields IS NULL OR jsonb_typeof(fields) <> 'array' THEN
    RETURN NULL;
  END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(fields) LOOP
    IF coalesce(f->>'uid', '') <> '' THEN
      key := f->>'uid';
    ELSE
      n := coalesce((seen->>(f->>'id'))::int, 0) + 1;
      seen := seen || jsonb_build_object(f->>'id', n);
      key := CASE WHEN n > 1 THEN (f->>'id') || '#' || n ELSE f->>'id' END;
    END IF;
    IF NOT hit AND key = p_uid THEN
      hit := true;
      f := f || jsonb_build_object('uid', key);
      IF p_file IS NULL OR jsonb_typeof(p_file) <> 'object' THEN
        f := f - 'beamerFile';
      ELSE
        f := f || jsonb_build_object('beamerFile', p_file);
      END IF;
    END IF;
    result := result || jsonb_build_array(f);
  END LOOP;
  RETURN CASE WHEN hit THEN result END;
END;
$$;

-- Nur für fecg-bridge (service_role): Ad-hoc-Plan über p_shared_plan_id, sonst
-- Termin p_attendance_id mit Plan Nummer p_plan_index (0 = plan, 1… = extra_plans).
CREATE OR REPLACE FUNCTION fecg_set_beamer_file(
  p_attendance_id bigint,
  p_plan_index int,
  p_shared_plan_id text,
  p_field_uid text,
  p_file jsonb
) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE
  v_fields jsonb;
  v_plan jsonb;
  v_extra jsonb;
  v_new jsonb;
BEGIN
  PERFORM set_config('fecg.beamer_write', 'on', true);

  IF p_shared_plan_id IS NOT NULL THEN
    SELECT fields INTO v_fields FROM shared_plans WHERE id = p_shared_plan_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    v_new := fecg_link_field(v_fields, p_field_uid, p_file);
    IF v_new IS NULL THEN RETURN false; END IF;
    UPDATE shared_plans SET fields = v_new WHERE id = p_shared_plan_id;
  ELSE
    SELECT plan, extra_plans INTO v_plan, v_extra FROM attendance WHERE id = p_attendance_id FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    IF coalesce(p_plan_index, 0) = 0 THEN
      v_new := fecg_link_field(v_plan->'fields', p_field_uid, p_file);
      IF v_new IS NULL THEN RETURN false; END IF;
      UPDATE attendance SET plan = jsonb_set(plan, '{fields}', v_new) WHERE id = p_attendance_id;
    ELSE
      v_new := fecg_link_field(v_extra->(p_plan_index - 1)->'fields', p_field_uid, p_file);
      IF v_new IS NULL THEN RETURN false; END IF;
      UPDATE attendance
        SET extra_plans = jsonb_set(extra_plans, ARRAY[(p_plan_index - 1)::text, 'fields'], v_new)
        WHERE id = p_attendance_id;
    END IF;
  END IF;

  PERFORM set_config('fecg.beamer_write', 'off', true);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION fecg_set_beamer_file(bigint, int, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fecg_set_beamer_file(bigint, int, text, text, jsonb) TO service_role;
