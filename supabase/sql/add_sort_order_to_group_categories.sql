-- Add sort_order column to group_categories table
ALTER TABLE group_categories
ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_group_categories_sort_order ON group_categories(sort_order);
