ALTER TABLE tenant_role_permissions
  ADD COLUMN IF NOT EXISTS player_self_pause boolean NOT NULL DEFAULT false;
