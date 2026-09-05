ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS show_all_attendances BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS show_all_attendances_info_text TEXT;
