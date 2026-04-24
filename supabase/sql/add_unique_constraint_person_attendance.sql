-- Add unique constraint to prevent duplicate person-attendance entries
-- This ensures that each person can only appear once per attendance

-- First, remove any existing duplicates before adding the constraint
-- Keep entries with changed_at (edited entries), delete NULL entries first
-- If both have changed_at or both are NULL, keep the one with lower id
WITH ranked_duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY attendance_id, person_id
      ORDER BY
        CASE WHEN changed_at IS NULL THEN 1 ELSE 0 END,  -- NULL last (will be deleted)
        changed_at DESC NULLS LAST,                       -- Most recently changed first
        id ASC                                            -- Tie-breaker: keep lowest id
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
