ALTER TABLE tenant_role_permissions
  ADD COLUMN IF NOT EXISTS player_planned_absence boolean NOT NULL DEFAULT false;
