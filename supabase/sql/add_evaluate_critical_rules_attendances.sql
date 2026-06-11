-- ============================================
-- RPC: evaluate_critical_rules_attendances
-- Server-side join + filter for the evaluate-critical-rules Edge Function.
-- Avoids two PostgREST traps:
--   (1) the default 1000-row response cap, which silently truncates large
--       per-tenant attendance windows (long rule periods, ALL_TIME rules);
--   (2) the join-then-filter ordering on `attendance:attendance_id(...)`
--       embeds, where filters on the joined table are applied AFTER the
--       parent row set has already been capped.
-- Returns the same flat shape the existing JS reducer consumes; the Edge
-- Function re-nests under `att.attendance` for downstream rule evaluation.
-- ============================================

CREATE OR REPLACE FUNCTION public.evaluate_critical_rules_attendances(
  p_tenant_id bigint,
  p_start     timestamptz,
  p_end       timestamptz
)
RETURNS TABLE (
  id                 uuid,
  person_id          bigint,
  status             int,
  attendance_id      bigint,
  attendance_date    timestamptz,
  attendance_type_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pa.id,
    pa.person_id,
    pa.status,
    a.id      AS attendance_id,
    a.date    AS attendance_date,
    a.type_id AS attendance_type_id
  FROM public.person_attendances pa
  JOIN public.attendance a ON a.id = pa.attendance_id
  WHERE a."tenantId" = p_tenant_id
    AND a.date >= p_start
    AND a.date <  p_end;
$$;

-- Edge Functions call via the service role; lock the function down so it
-- can't be invoked anonymously from the client.
REVOKE ALL ON FUNCTION public.evaluate_critical_rules_attendances(bigint, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_critical_rules_attendances(bigint, timestamptz, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_critical_rules_attendances(bigint, timestamptz, timestamptz) TO service_role;
