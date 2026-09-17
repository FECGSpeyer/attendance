-- Allow authenticated users to insert their own player row during self-registration.
-- The anon policy only covers unauthenticated flows; users who sign up via invite link
-- or OTP are authenticated at insert time and need a separate policy.
CREATE POLICY "authenticated_insert_own_player_registration"
  ON player FOR INSERT
  TO authenticated
  WITH CHECK (
    "tenantId" IN (
      SELECT id FROM tenants WHERE register_id IS NOT NULL
    )
    AND appId = auth.uid()::text
  );
