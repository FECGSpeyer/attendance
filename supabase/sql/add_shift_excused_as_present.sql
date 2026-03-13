-- Add shift_excused_as_present column to tenant table
ALTER TABLE tenant
ADD COLUMN IF NOT EXISTS shift_excused_as_present BOOLEAN NOT NULL DEFAULT false;
