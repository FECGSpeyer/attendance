-- Add new permission columns to existing tenant_role_permissions table
ALTER TABLE tenant_role_permissions
ADD COLUMN IF NOT EXISTS attendance_create BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS player_notes_view BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS checklist_view BOOLEAN NOT NULL DEFAULT false;
