-- ============================================
-- Usage dashboard aggregation RPCs
--
-- The dashboard previously pulled raw usage_events rows to the client and
-- counted them in JS. PostgREST caps a .select() at 1000 rows, so every date
-- range returned the same first 1000 rows and all KPIs/charts were wrong (and
-- identical across ranges). These RPCs aggregate server-side, so counts are
-- exact regardless of how many events exist in the window.
--
-- Access: same guard as the usage_events read policy — only developer@attendix.de.
-- Each function re-checks the JWT email itself (SECURITY DEFINER bypasses RLS,
-- so the check must be explicit) and returns nothing to anyone else.
--
-- p_since is an ISO timestamp (the client passes the range cutoff); rows are
-- filtered on created_at >= p_since. The event-name allowlist is applied by the
-- caller passing p_events (the app's current TrackingEvent values), so stale
-- event names from older app versions stay excluded — matching the client-side
-- filter that previously lived in dashboard.page.ts.
-- ============================================

-- Guard helper: raises if the caller is not the super-developer.
CREATE OR REPLACE FUNCTION public.assert_usage_dashboard_access()
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'email', '') <> 'developer@attendix.de' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$$;

-- --------------------------------------------
-- KPIs: total events, distinct tenants, active tenants in last 7 days.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.usage_kpis(
  p_since  timestamptz,
  p_events text[]
)
RETURNS TABLE (
  total_events        bigint,
  distinct_tenants    bigint,
  active_tenants_7d   bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_usage_dashboard_access();
  RETURN QUERY
  SELECT
    count(*)::bigint,
    count(DISTINCT tenant_id)::bigint,
    count(DISTINCT tenant_id) FILTER (
      WHERE created_at >= now() - interval '7 days'
    )::bigint
  FROM public.usage_events
  WHERE created_at >= p_since
    AND event_name = ANY(p_events);
END;
$$;

-- --------------------------------------------
-- Events per calendar day (UTC). Only days with events are returned; the client
-- fills gaps with zeros for the full range.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.usage_events_per_day(
  p_since  timestamptz,
  p_events text[]
)
RETURNS TABLE (
  day   date,
  count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_usage_dashboard_access();
  RETURN QUERY
  SELECT (created_at AT TIME ZONE 'UTC')::date AS day, count(*)::bigint
  FROM public.usage_events
  WHERE created_at >= p_since
    AND event_name = ANY(p_events)
  GROUP BY 1
  ORDER BY 1;
END;
$$;

-- --------------------------------------------
-- Events grouped by event_name (all matching names; client slices top N).
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.usage_events_by_name(
  p_since  timestamptz,
  p_events text[]
)
RETURNS TABLE (
  event_name text,
  count      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_usage_dashboard_access();
  RETURN QUERY
  SELECT e.event_name, count(*)::bigint
  FROM public.usage_events e
  WHERE e.created_at >= p_since
    AND e.event_name = ANY(p_events)
  GROUP BY e.event_name
  ORDER BY count(*) DESC;
END;
$$;

-- --------------------------------------------
-- Events grouped by tenant_id (client slices top N). NULL tenant excluded.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.usage_events_by_tenant(
  p_since  timestamptz,
  p_events text[]
)
RETURNS TABLE (
  tenant_id bigint,
  count     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_usage_dashboard_access();
  RETURN QUERY
  SELECT e.tenant_id, count(*)::bigint
  FROM public.usage_events e
  WHERE e.created_at >= p_since
    AND e.event_name = ANY(p_events)
    AND e.tenant_id IS NOT NULL
  GROUP BY e.tenant_id
  ORDER BY count(*) DESC;
END;
$$;

-- --------------------------------------------
-- Events grouped by device_type. NULL device mapped to 'unknown'.
-- --------------------------------------------
CREATE OR REPLACE FUNCTION public.usage_events_by_device(
  p_since  timestamptz,
  p_events text[]
)
RETURNS TABLE (
  device_type text,
  count       bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_usage_dashboard_access();
  RETURN QUERY
  SELECT coalesce(e.device_type, 'unknown') AS device_type, count(*)::bigint
  FROM public.usage_events e
  WHERE e.created_at >= p_since
    AND e.event_name = ANY(p_events)
  GROUP BY coalesce(e.device_type, 'unknown')
  ORDER BY count(*) DESC;
END;
$$;

-- --------------------------------------------
-- Grants: the dashboard runs client-side as the authenticated developer, so
-- these must be executable by `authenticated`. The internal email guard keeps
-- everyone else out even though the grant is broad.
-- --------------------------------------------
REVOKE ALL ON FUNCTION public.assert_usage_dashboard_access()               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usage_kpis(timestamptz, text[])               FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usage_events_per_day(timestamptz, text[])     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usage_events_by_name(timestamptz, text[])     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usage_events_by_tenant(timestamptz, text[])   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.usage_events_by_device(timestamptz, text[])   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.usage_kpis(timestamptz, text[])             TO authenticated;
GRANT EXECUTE ON FUNCTION public.usage_events_per_day(timestamptz, text[])   TO authenticated;
GRANT EXECUTE ON FUNCTION public.usage_events_by_name(timestamptz, text[])   TO authenticated;
GRANT EXECUTE ON FUNCTION public.usage_events_by_tenant(timestamptz, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.usage_events_by_device(timestamptz, text[]) TO authenticated;
