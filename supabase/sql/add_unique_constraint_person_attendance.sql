-- Add unique constraint to prevent duplicate person-attendance entries
-- This ensures that each person can only appear once per attendance

-- First, remove any existing duplicates before adding the constraint
-- Keep the oldest entry for each duplicate combination
WITH ranked_duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY attendance_id, person_id
      ORDER BY created_at ASC
    ) as rn
  FROM person_attendances
)
DELETE FROM person_attendances
WHERE id IN (
  SELECT id
  FROM ranked_duplicates
  WHERE rn > 1
);

-- Now add the unique constraint
ALTER TABLE person_attendances
ADD CONSTRAINT unique_person_per_attendance
UNIQUE (attendance_id, person_id);
