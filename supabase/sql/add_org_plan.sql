-- Org-level planning: flag attendance rows as org-visible and add a stable
-- public token to each organisation so anyone with the link can view the plans.

-- New column on attendance
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_org_plan boolean DEFAULT false;

-- Stable public token + branding on each organisation
ALTER TABLE tenant_groups ADD COLUMN IF NOT EXISTS public_plan_key text;
ALTER TABLE tenant_groups ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE tenant_groups ADD COLUMN IF NOT EXISTS branding_text text;

-- Fast partial indexes
CREATE INDEX IF NOT EXISTS idx_attendance_is_org_plan
  ON attendance(is_org_plan) WHERE is_org_plan = true;

CREATE INDEX IF NOT EXISTS idx_tenant_groups_public_key
  ON tenant_groups(public_plan_key) WHERE public_plan_key IS NOT NULL;

-- Ad-hoc org plans: standalone shared_plans rows owned by an org
ALTER TABLE shared_plans ADD COLUMN IF NOT EXISTS org_id bigint REFERENCES tenant_groups(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_shared_plans_org_id ON shared_plans(org_id) WHERE org_id IS NOT NULL;

-- RLS: org members (admin/responsible) can read ad-hoc org shared_plans
CREATE POLICY "org_members_read_adhoc_org_plans"
  ON shared_plans FOR SELECT
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM   tenant_group_tenants tgt
      JOIN   "tenantUsers" tu ON tu."tenantId" = tgt.tenant_id
      WHERE  tgt.tenant_group = shared_plans.org_id
        AND  tu."userId"      = auth.uid()::text
        AND  tu.role IN (1, 5)
    )
  );

-- RLS: anon can read ad-hoc org shared_plans when org has public_plan_key
CREATE POLICY "anon_read_adhoc_org_plans"
  ON shared_plans FOR SELECT
  TO anon
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tenant_groups tg
      WHERE tg.id = shared_plans.org_id
        AND tg.public_plan_key IS NOT NULL
    )
  );

-- RLS: org members (admin/responsible) can insert ad-hoc org shared_plans
CREATE POLICY "org_members_insert_adhoc_org_plans"
  ON shared_plans FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM   tenant_group_tenants tgt
      JOIN   "tenantUsers" tu ON tu."tenantId" = tgt.tenant_id
      WHERE  tgt.tenant_group = org_id
        AND  tu."userId"      = auth.uid()::text
        AND  tu.role IN (1, 5)
    )
  );

-- RLS: org members (admin/responsible) can update ad-hoc org shared_plans
CREATE POLICY "org_members_update_adhoc_org_plans"
  ON shared_plans FOR UPDATE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM   tenant_group_tenants tgt
      JOIN   "tenantUsers" tu ON tu."tenantId" = tgt.tenant_id
      WHERE  tgt.tenant_group = shared_plans.org_id
        AND  tu."userId"      = auth.uid()::text
        AND  tu.role IN (1, 5)
    )
  );

-- RLS: org members (admin/responsible) can delete ad-hoc org shared_plans
CREATE POLICY "org_members_delete_adhoc_org_plans"
  ON shared_plans FOR DELETE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM   tenant_group_tenants tgt
      JOIN   "tenantUsers" tu ON tu."tenantId" = tgt.tenant_id
      WHERE  tgt.tenant_group = shared_plans.org_id
        AND  tu."userId"      = auth.uid()::text
        AND  tu.role IN (1, 5)
    )
  );

-- RLS: org members (admin = 1, responsible = 5) can read all org-plan
-- attendances that belong to any tenant in their own organisation.
CREATE POLICY "org_members_read_org_plans"
  ON attendance FOR SELECT
  TO authenticated
  USING (
    is_org_plan = true
    AND EXISTS (
      SELECT 1
      FROM   tenant_group_tenants tgt1
      JOIN   tenant_group_tenants tgt2 ON tgt1.tenant_group = tgt2.tenant_group
      JOIN   "tenantUsers" tu          ON tu."tenantId" = tgt1.tenant_id
      WHERE  tgt2.tenant_id  = attendance."tenantId"
        AND  tu."userId"     = auth.uid()::text
        AND  tu.role IN (1, 5)
    )
  );

-- RLS: anon can read org-plan attendances when the org they belong to has a
-- non-null public_plan_key (the actual key match is enforced in the query).
CREATE POLICY "anon_read_org_plans"
  ON attendance FOR SELECT
  TO anon
  USING (
    is_org_plan = true
    AND EXISTS (
      SELECT 1
      FROM   tenant_group_tenants tgt
      JOIN   tenant_groups         tg  ON tg.id = tgt.tenant_group
      WHERE  tgt.tenant_id        = attendance."tenantId"
        AND  tg.public_plan_key  IS NOT NULL
    )
  );

-- RLS: org members (admin/responsible) can update their org's branding
CREATE POLICY "org_members_update_branding"
  ON tenant_groups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM   tenant_group_tenants tgt
      JOIN   "tenantUsers" tu ON tu."tenantId" = tgt.tenant_id
      WHERE  tgt.tenant_group = tenant_groups.id
        AND  tu."userId"      = auth.uid()::text
        AND  tu.role IN (1, 5)
    )
  );
