-- ============================================
-- RPC: get_user_id_by_msoid
-- Server-side lookup for the teams-sso Edge Function: resolves the Attendix
-- Supabase auth user linked to a given Microsoft Entra object id (oid), which
-- is stored server-side in auth.users.raw_app_meta_data->>'msoid' during the
-- one-time Teams account-linking step.
--
-- The msoid lives in app_metadata (NOT user_metadata) precisely so the client
-- cannot forge it via supabase.auth.updateUser(); only the service role writes
-- it. This function reads auth.users, so it must be SECURITY DEFINER and is
-- locked to service_role — never callable from anon/authenticated clients.
--
-- Mirrors the existing get_user_id_by_email RPC (same { id }[] shape).
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_id_by_msoid(
  p_msoid text
)
RETURNS TABLE (
  id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE u.raw_app_meta_data->>'msoid' = p_msoid
  LIMIT 1;
$$;

-- Edge Functions call via the service role; lock the function down so a client
-- can never enumerate/resolve users by Microsoft identity.
REVOKE ALL ON FUNCTION public.get_user_id_by_msoid(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_id_by_msoid(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_msoid(text) TO service_role;

-- Enforce one Supabase user per Microsoft identity. A partial unique index on
-- the msoid extracted from app_metadata prevents two accounts ever claiming the
-- same oid (defence-in-depth alongside the 409 guard in the link action).
CREATE UNIQUE INDEX IF NOT EXISTS users_msoid_unique_idx
  ON auth.users ((raw_app_meta_data->>'msoid'))
  WHERE raw_app_meta_data->>'msoid' IS NOT NULL;
