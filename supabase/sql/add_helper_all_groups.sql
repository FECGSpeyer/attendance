-- Create tenant_role_permissions table
-- Stores configurable permissions per role per tenant.
-- ADMIN and RESPONSIBLE always have full access and are not stored here.

CREATE TABLE IF NOT EXISTS tenant_role_permissions (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role INTEGER NOT NULL,
  attendance_all_groups BOOLEAN NOT NULL DEFAULT true,
  attendance_create BOOLEAN NOT NULL DEFAULT true,
  player_notes_view BOOLEAN NOT NULL DEFAULT false,
  checklist_view BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tenant_id, role)
);

-- Enable RLS
ALTER TABLE tenant_role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS: Users can read permissions for tenants they belong to
CREATE POLICY "Users can read own tenant permissions"
  ON tenant_role_permissions FOR SELECT
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers" WHERE "userId" = auth.uid()::text
    )
  );

-- RLS: Only admins/responsible can update permissions
CREATE POLICY "Admins can manage tenant permissions"
  ON tenant_role_permissions FOR ALL
  USING (
    tenant_id IN (
      SELECT "tenantId" FROM "tenantUsers"
      WHERE "userId" = auth.uid()::text AND role IN (1, 5)
    )
  );

-- Seed default rows for existing tenants
-- Configurable roles: HELPER(4), VOICE_LEADER_HELPER(9), PLAYER(2), VIEWER(3), PARENT(6), VOICE_LEADER(8)
INSERT INTO tenant_role_permissions (tenant_id, role, attendance_all_groups)
SELECT t.id, r.role, true
FROM tenants t
CROSS JOIN (VALUES (4), (9), (2), (3), (6), (8)) AS r(role)
ON CONFLICT (tenant_id, role) DO NOTHING;

-- Auto-create default permission rows for new tenants
CREATE OR REPLACE FUNCTION create_default_role_permissions()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO tenant_role_permissions (tenant_id, role)
  VALUES
    (NEW.id, 4),  -- HELPER
    (NEW.id, 9),  -- VOICE_LEADER_HELPER
    (NEW.id, 2),  -- PLAYER
    (NEW.id, 3),  -- VIEWER
    (NEW.id, 6),  -- PARENT
    (NEW.id, 8);  -- VOICE_LEADER
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_default_role_permissions
  AFTER INSERT ON tenants
  FOR EACH ROW
  EXECUTE FUNCTION create_default_role_permissions();
