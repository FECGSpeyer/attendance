ALTER TABLE tenant_groups
  ADD COLUMN IF NOT EXISTS planning_templates jsonb,
  ADD COLUMN IF NOT EXISTS default_fields jsonb;
