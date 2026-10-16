-- Mehrere Ablaufpläne pro Termin (z. B. einer pro Tag bei Freizeiten).
-- `plan` bleibt der erste Plan; weitere Pläne liegen in `extra_plans`
-- (Array von Plan-Objekten mit optional id, label, day).
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS extra_plans jsonb;
