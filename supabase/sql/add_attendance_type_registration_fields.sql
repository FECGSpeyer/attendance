ALTER TABLE attendance_types
  ADD COLUMN IF NOT EXISTS registration_fields jsonb;

ALTER TABLE person_attendances
  ADD COLUMN IF NOT EXISTS registration_answers jsonb;
