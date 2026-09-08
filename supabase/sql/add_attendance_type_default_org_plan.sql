ALTER TABLE attendance_types
  ADD COLUMN IF NOT EXISTS is_default_org_plan boolean NOT NULL DEFAULT false;
