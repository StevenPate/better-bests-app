-- Remove duplicate entries, keeping only Wednesday entries (when lists are published)
-- First, let's see what day of week each entry falls on and remove non-Wednesday entries

DELETE FROM book_positions 
WHERE EXTRACT(DOW FROM week_date) != 3; -- 3 = Wednesday (0=Sunday, 1=Monday, ..., 6=Saturday)

-- If there are still duplicates on the same Wednesday, keep only the first one (by created_at)
DELETE FROM book_positions 
WHERE id NOT IN (
  SELECT DISTINCT ON (isbn, week_date, category) id
  FROM book_positions 
  ORDER BY isbn, week_date, category, created_at ASC
);