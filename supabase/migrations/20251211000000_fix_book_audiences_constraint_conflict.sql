-- Migration: Fix conflicting unique constraints on book_audiences
-- Date: 2025-12-11
-- Issue: Migration 20251210000000 added UNIQUE (isbn) which conflicts with
--        the multi-region design that requires UNIQUE (region, isbn)
-- Resolution: Drop the incorrect single-column constraint and ensure the
--             correct composite constraint exists

-- Step 1: Drop the incorrect UNIQUE (isbn) constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'book_audiences_isbn_key'
      AND conrelid = 'public.book_audiences'::regclass
  ) THEN
    ALTER TABLE public.book_audiences
    DROP CONSTRAINT book_audiences_isbn_key;

    RAISE NOTICE 'Dropped incorrect constraint book_audiences_isbn_key';
  ELSE
    RAISE NOTICE 'Constraint book_audiences_isbn_key does not exist (already dropped)';
  END IF;
END $$;

-- Step 2: Ensure the correct composite constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'book_audiences_region_isbn_key'
      AND conrelid = 'public.book_audiences'::regclass
  ) THEN
    -- Add the correct multi-region constraint
    ALTER TABLE public.book_audiences
    ADD CONSTRAINT book_audiences_region_isbn_key UNIQUE (region, isbn);

    RAISE NOTICE 'Added correct constraint book_audiences_region_isbn_key (region, isbn)';
  ELSE
    RAISE NOTICE 'Constraint book_audiences_region_isbn_key already exists';
  END IF;
END $$;

-- Step 3: Add comment to document the constraint
COMMENT ON CONSTRAINT book_audiences_region_isbn_key ON public.book_audiences IS
  'Multi-region support: Same ISBN can have different audience classifications per region';
