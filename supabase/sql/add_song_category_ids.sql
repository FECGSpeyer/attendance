ALTER TABLE songs ADD COLUMN IF NOT EXISTS category_ids uuid[] DEFAULT '{}';

UPDATE songs
SET category_ids = ARRAY[category]
WHERE category IS NOT NULL;
