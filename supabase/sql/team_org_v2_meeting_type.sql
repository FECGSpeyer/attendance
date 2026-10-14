-- Teamorganisation: eigener Termin-Typ "Besprechung" für Protokolle
--
-- 1. Legt in jeder Instanz, die Protokolle hat aber noch keinen Typ mit
--    enable_protocol, einen Typ "Besprechung" an (nur die Hauptgruppe als
--    relevante Gruppe, Tagesordnungs-Platzhalter im Standard-Ablauf).
-- 2. Hängt jedes Protokoll, das an einem Termin ohne Protokoll-Typ hängt, an
--    einen Termin des Protokoll-Typs am selben Tag:
--    - Platzhalter-Termine der alten Migration (typeInfo 'Besprechung',
--      save_in_history false, angelegt ab 1.10.2026) werden umgetypt; sie
--      enthalten nur die Teilnehmenden der Besprechung.
--    - Für echte Termine (Probe, Übung, …) wird ein neuer Termin angelegt
--      und das Protokoll umgehängt; der echte Termin bleibt unverändert.
--    Instanzen mit bereits vorhandenem Protokoll-Typ (z. B. 12) nutzen diesen.
-- Sicherung: public.backup_protocol_attendance_20261014.

SET lock_timeout = '8s';

CREATE TABLE IF NOT EXISTS public.backup_protocol_attendance_20261014 AS
SELECT p.id AS protocol_id, p.attendance_id, a.type_id, a."typeInfo", now() AS backed_up_at
FROM public.protocols p
JOIN public.attendance a ON a.id = p.attendance_id
JOIN public.attendance_types t ON t.id = a.type_id
WHERE NOT t.enable_protocol;
ALTER TABLE public.backup_protocol_attendance_20261014 ENABLE ROW LEVEL SECURITY;

-- 1. Typen anlegen
INSERT INTO public.attendance_types (
  name, planning_title, enable_protocol, relevant_groups, default_plan,
  start_time, end_time, default_status, available_statuses, include_in_average,
  manage_songs, visible, color, highlight, hide_name, reminders, index, tenant_id
)
SELECT 'Besprechung', '', true,
       ARRAY[(SELECT min(i.id) FROM public.instruments i WHERE i."tenantId" = x.tenant_id AND i.maingroup)]::bigint[],
       '{"time":"19:00","end":"","fields":[{"id":"agenda-items-placeholder","name":"Tagesordnung","time":"0"}]}'::jsonb,
       '19:00', '20:30', 1, '{0,1,4,2,3}'::smallint[], false,
       false, true, 'primary', false, false, '{}'::smallint[],
       LEAST(COALESCE((SELECT max(t2.index) FROM public.attendance_types t2
                       WHERE t2.tenant_id = x.tenant_id AND t2.index < 999), 0) + 1, 998),
       x.tenant_id
FROM (
  SELECT DISTINCT p.tenant_id
  FROM public.protocols p
  JOIN public.attendance a ON a.id = p.attendance_id
  JOIN public.attendance_types t ON t.id = a.type_id
  WHERE NOT t.enable_protocol
) x
WHERE NOT EXISTS (
  SELECT 1 FROM public.attendance_types e WHERE e.tenant_id = x.tenant_id AND e.enable_protocol
);

-- 2. Protokolle umhängen
DO $$
DECLARE
  r record;
  target_type uuid;
  new_att bigint;
BEGIN
  FOR r IN
    SELECT p.id AS protocol_id, p.tenant_id, a.id AS att_id, a.date, a."typeInfo",
           a.save_in_history, a.created_at
    FROM public.protocols p
    JOIN public.attendance a ON a.id = p.attendance_id
    JOIN public.attendance_types t ON t.id = a.type_id
    WHERE NOT t.enable_protocol
  LOOP
    SELECT e.id INTO target_type
    FROM public.attendance_types e
    WHERE e.tenant_id = r.tenant_id AND e.enable_protocol
    ORDER BY (e.name = 'Besprechung') DESC, e.created_at
    LIMIT 1;

    IF r."typeInfo" = 'Besprechung' AND NOT coalesce(r.save_in_history, false)
       AND r.created_at >= '2026-10-01' THEN
      UPDATE public.attendance
      SET type_id = target_type, "typeInfo" = NULL, start_time = '19:00', end_time = '20:30'
      WHERE id = r.att_id;
    ELSE
      INSERT INTO public.attendance ("tenantId", date, type_id, start_time, end_time, save_in_history)
      VALUES (r.tenant_id, date_trunc('day', r.date), target_type, '19:00', '20:30', false)
      RETURNING id INTO new_att;
      UPDATE public.protocols SET attendance_id = new_att WHERE id = r.protocol_id;
    END IF;
  END LOOP;
END $$;
