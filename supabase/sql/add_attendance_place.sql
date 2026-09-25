ALTER TABLE attendance_types
  ADD COLUMN IF NOT EXISTS place_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS place text;
