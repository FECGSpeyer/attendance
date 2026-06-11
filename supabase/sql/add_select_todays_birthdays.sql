-- ============================================
-- RPC: select_todays_birthdays
-- Server-side filter for the birthday-sync Edge Function so it doesn't
-- have to page through every active player just to keep ~3 today.
-- Returns only players whose birthday matches the given month+day,
-- excluding rows that left the team or have correctBirthday=false/null.
-- ============================================

CREATE OR REPLACE FUNCTION public.select_todays_birthdays(
  p_month int,
  p_day   int
)
RETURNS TABLE (
  id          bigint,
  "firstName" text,
  "lastName"  text,
  birthday    timestamptz,
  "tenantId"  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, "firstName", "lastName", birthday, "tenantId"
  FROM public.player
  WHERE "left" IS NULL
    AND "correctBirthday" IS TRUE
    AND birthday IS NOT NULL
    AND extract(month FROM birthday AT TIME ZONE 'UTC') = p_month
    AND extract(day   FROM birthday AT TIME ZONE 'UTC') = p_day;
$$;

-- Edge Functions call via the service role; lock the function down so it
-- can't be invoked anonymously from the client.
REVOKE ALL ON FUNCTION public.select_todays_birthdays(int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.select_todays_birthdays(int, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_todays_birthdays(int, int) TO service_role;

-- Functional index keeps the lookup fast as the player table grows.
-- `birthday AT TIME ZONE 'UTC'` produces a `timestamp` (no zone), and
-- `extract(...)` on a plain timestamp is IMMUTABLE — index-eligible.
CREATE INDEX IF NOT EXISTS player_birthday_md_idx
  ON public.player (
    (extract(month FROM (birthday AT TIME ZONE 'UTC'))),
    (extract(day   FROM (birthday AT TIME ZONE 'UTC')))
  )
  WHERE "left" IS NULL AND "correctBirthday" IS TRUE AND birthday IS NOT NULL;
