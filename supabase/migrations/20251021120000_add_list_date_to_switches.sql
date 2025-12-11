-- Migration: Add list_date column to bestseller_switches
-- Author: Issue #13 Follow-up
-- Date: 2025-10-21
-- Description: Scope switches by week date to prevent cross-week persistence

-- ============================================================================
-- Step 1: Add list_date column (nullable initially for backward compatibility)
-- ============================================================================
ALTER TABLE public.bestseller_switches
ADD COLUMN IF NOT EXISTS list_date DATE;

-- ============================================================================
-- Step 2: Backfill existing records with current week date
-- ============================================================================
-- Get the most recent week_date from book_positions
DO $$
DECLARE
  current_week DATE;
BEGIN
  SELECT MAX(week_date) INTO current_week
  FROM public.book_positions;

  -- Update existing records with the current week
  UPDATE public.bestseller_switches
  SET list_date = current_week
  WHERE list_date IS NULL;
END $$;

-- ============================================================================
-- Step 3: Make list_date NOT NULL now that backfill is complete
-- ============================================================================
ALTER TABLE public.bestseller_switches
ALTER COLUMN list_date SET NOT NULL;

-- ============================================================================
-- Step 4: Add composite unique constraint (book_isbn, switch_type, list_date)
-- ============================================================================
-- Drop old constraint if exists
ALTER TABLE public.bestseller_switches
DROP CONSTRAINT IF EXISTS bestseller_switches_book_isbn_switch_type_key;

-- Add new composite constraint
ALTER TABLE public.bestseller_switches
ADD CONSTRAINT bestseller_switches_book_isbn_switch_type_list_date_key
UNIQUE (book_isbn, switch_type, list_date);

-- ============================================================================
-- Step 5: Add index for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_bestseller_switches_list_date
ON public.bestseller_switches(list_date DESC);

-- ============================================================================
-- Step 6: Update RLS policies to filter by list_date
-- ============================================================================
-- Drop existing policies
DROP POLICY IF EXISTS "Public can view bestseller switches"
ON public.bestseller_switches;

DROP POLICY IF EXISTS "PBN staff can manage bestseller switches"
ON public.bestseller_switches;

-- Policy: Public can view switches for recent weeks only
CREATE POLICY "Public can view recent bestseller switches"
ON public.bestseller_switches
FOR SELECT
USING (list_date >= CURRENT_DATE - INTERVAL '30 days');

-- Policy: PBN staff can manage switches for recent weeks
CREATE POLICY "PBN staff can manage recent bestseller switches"
ON public.bestseller_switches
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'pbn_staff')
  AND list_date >= CURRENT_DATE - INTERVAL '30 days'
)
WITH CHECK (
  public.has_role(auth.uid(), 'pbn_staff')
  AND list_date >= CURRENT_DATE - INTERVAL '30 days'
);

COMMENT ON COLUMN public.bestseller_switches.list_date IS 'The week date this switch applies to (prevents cross-week persistence)';
COMMENT ON TABLE public.bestseller_switches IS 'User switches for POS/Shelf checkboxes, scoped by list_date to prevent cross-week data corruption';

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'Successfully added list_date column to bestseller_switches';
  RAISE NOTICE 'Updated RLS policies to scope by list_date';
  RAISE NOTICE 'Added composite unique constraint (book_isbn, switch_type, list_date)';
END $$;
