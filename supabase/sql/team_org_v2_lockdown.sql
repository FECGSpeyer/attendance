-- ============================================================
-- Teamorganisation v2 – Lesezugriff für Mitglieder eingrenzen (14.10.2026)
-- 1. Mitglieder lesen nur Protokolle von Termintypen mit eingeschaltetem
--    Protokoll (übernommene Besprechungen an Proben bleiben bei der Leitung).
-- 2. Die alten offenen Lese-Policies ("alle Mitglieder lesen alles") werden
--    auf die Leitung beschränkt, bis team_org_v2_cleanup.sql sie entfernt.
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_read_protocol(p_attendance_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM attendance a
    JOIN attendance_types t ON t.id = a.type_id
    WHERE a.id = p_attendance_id
      AND t.enable_protocol
      AND public.in_protocol_circle(a.type_id)
  );
$$;

ALTER POLICY "tenant members can read protocols" ON public.protocols
  USING (public.is_tenant_leader(tenant_id));
ALTER POLICY "tenant members can read agenda items" ON public.agenda_items
  USING (public.is_tenant_leader(tenant_id));
ALTER POLICY "tenant members can read tasks" ON public.tasks
  USING (public.is_tenant_leader(tenant_id));
