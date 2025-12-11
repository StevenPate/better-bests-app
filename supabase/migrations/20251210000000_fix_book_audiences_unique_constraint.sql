-- Migration: Fix missing unique constraint on book_audiences.isbn
-- Issue: The upsert operation fails with "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- This happens when the table was created before the UNIQUE constraint was added in the schema

-- Step 1: Remove duplicate ISBNs (keep the most recently updated one)
-- If timestamps are equal, keep the row with the higher id as a tie-breaker
DELETE FROM public.book_audiences a
USING public.book_audiences b
WHERE a.isbn = b.isbn
  AND (a.updated_at < b.updated_at OR (a.updated_at = b.updated_at AND a.id < b.id));

-- Step 2: Add unique constraint if it doesn't exist
DO $$
BEGIN
  -- Check if the constraint already exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'book_audiences_isbn_key'
      AND conrelid = 'public.book_audiences'::regclass
  ) THEN
    -- Add the unique constraint
    ALTER TABLE public.book_audiences
    ADD CONSTRAINT book_audiences_isbn_key UNIQUE (isbn);

    RAISE NOTICE 'Added unique constraint book_audiences_isbn_key on isbn column';
  ELSE
    RAISE NOTICE 'Unique constraint book_audiences_isbn_key already exists';
  END IF;
END $$;
