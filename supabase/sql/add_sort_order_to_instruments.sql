-- Add sort_order column to instruments table for score-based sorting
ALTER TABLE instruments ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS instruments_sort_order_idx ON instruments(sort_order);

-- Comment to explain the column
COMMENT ON COLUMN instruments.sort_order IS 'Order of the instrument in the score/sheet music (1, 2, 3...). NULL means alphabetical sorting.';
