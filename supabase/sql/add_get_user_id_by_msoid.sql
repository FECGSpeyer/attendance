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

-- NOTE: we intentionally do NOT create a unique index on auth.users here.
-- The auth schema is owned by supabase_auth_admin, and the SQL editor / postgres
-- role is not the owner of auth.users, so `CREATE INDEX ... ON auth.users`
-- fails with "must be owner of table users" on Supabase.
--
-- One Supabase user per Microsoft identity is instead enforced at the
-- application layer: the teams-sso Edge Function's `link` action rejects (409)
-- both an oid already linked to a different user and an account already linked
-- to a different oid before writing app_metadata.msoid.
