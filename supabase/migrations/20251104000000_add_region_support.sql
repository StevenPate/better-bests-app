-- Migration: Add multi-region support
-- Author: Multi-Region Expansion Project
-- Date: 2025-11-04
-- Description: Adds region column to relevant tables for multi-region bestseller tracking

-- ============================================================================
-- Add region column to bestseller_list_metadata
-- ============================================================================
-- Add region column (defaults to PNBA for existing data)
ALTER TABLE public.bestseller_list_metadata
ADD COLUMN IF NOT EXISTS region VARCHAR(20) NOT NULL DEFAULT 'PNBA';

-- Remove default after adding column (future inserts must specify region)
ALTER TABLE public.bestseller_list_metadata
ALTER COLUMN region DROP DEFAULT;

-- Add composite index for efficient region-based queries
CREATE INDEX IF NOT EXISTS idx_metadata_region_week
  ON public.bestseller_list_metadata(region, week_date DESC);

-- Note: Removed idx_metadata_region_current index as is_current_week column doesn't exist in current schema

-- Drop old unique constraint on week_date
-- This constraint would prevent the same week_date across different regions
ALTER TABLE public.bestseller_list_metadata
DROP CONSTRAINT IF EXISTS bestseller_list_metadata_week_date_key;

-- Add new composite unique constraint on (region, week_date)
-- This allows the same week_date to exist for different regions
ALTER TABLE public.bestseller_list_metadata
ADD CONSTRAINT bestseller_list_metadata_region_week_key UNIQUE (region, week_date);

COMMENT ON COLUMN public.bestseller_list_metadata.region IS 'Region abbreviation (PNBA, SIBA, GLIBA, etc.)';

-- ============================================================================
-- Add region column to book_audiences
-- ============================================================================
-- Add region column (defaults to PNBA for existing data)
ALTER TABLE public.book_audiences
ADD COLUMN IF NOT EXISTS region VARCHAR(20) NOT NULL DEFAULT 'PNBA';

-- Remove default after adding column
ALTER TABLE public.book_audiences
ALTER COLUMN region DROP DEFAULT;

-- Drop existing unique constraint on isbn
ALTER TABLE public.book_audiences DROP CONSTRAINT IF EXISTS book_audiences_isbn_key;

-- Add new composite unique constraint (ISBN can have different audiences per region)
ALTER TABLE public.book_audiences
ADD CONSTRAINT book_audiences_region_isbn_key UNIQUE (region, isbn);

-- Add index for region-based queries
CREATE INDEX IF NOT EXISTS idx_book_audiences_region
  ON public.book_audiences(region, isbn);

COMMENT ON COLUMN public.book_audiences.region IS 'Region abbreviation - same book may have different audience classifications per region';

-- ============================================================================
-- Add region column to bestseller_switches
-- ============================================================================
-- Add region column (defaults to PNBA for existing data)
ALTER TABLE public.bestseller_switches
ADD COLUMN IF NOT EXISTS region VARCHAR(20) NOT NULL DEFAULT 'PNBA';

-- Remove default after adding column
ALTER TABLE public.bestseller_switches
ALTER COLUMN region DROP DEFAULT;

-- Drop existing unique constraint (added in 20251021120000_add_list_date_to_switches.sql)
-- This constraint includes list_date but not region, preventing multi-region support
ALTER TABLE public.bestseller_switches
DROP CONSTRAINT IF EXISTS bestseller_switches_book_isbn_switch_type_list_date_key;

-- Also drop older constraint if it exists (from 20250829063240_migration.sql)
ALTER TABLE public.bestseller_switches
DROP CONSTRAINT IF EXISTS bestseller_switches_book_isbn_switch_type_key;

-- Add new composite unique constraint (switches are per-region, not per-date)
-- Note: We don't include list_date because a book can only have one switch state
-- at a time per region. The list_date is tracked for historical purposes.
ALTER TABLE public.bestseller_switches
ADD CONSTRAINT bestseller_switches_region_isbn_type_key UNIQUE (region, book_isbn, switch_type);

-- Add index for region-based queries
CREATE INDEX IF NOT EXISTS idx_bestseller_switches_region
  ON public.bestseller_switches(region, book_isbn);

COMMENT ON COLUMN public.bestseller_switches.region IS 'Region abbreviation - POS/shelf switches are region-specific';

-- ============================================================================
-- Create regions reference table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.regions (
  abbreviation VARCHAR(20) PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  region_code VARCHAR(10) NOT NULL, -- For URL construction (e.g., 'pn' for PNBA)
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert supported regions
INSERT INTO public.regions (abbreviation, full_name, region_code) VALUES
  ('PNBA', 'Pacific Northwest Booksellers Association', 'pn'),
  ('SIBA', 'Southern Independent Booksellers Alliance', 'se'),
  ('GLIBA', 'Great Lakes Independent Booksellers Association', 'gl'),
  ('CALIBAN', 'California Independent Booksellers Alliance (North)', 'nc'),
  ('CALIBAS', 'California Independent Booksellers Alliance (South)', 'sc'),
  ('MPIBA', 'Mountains & Plains Independent Booksellers Association', 'mp'),
  ('NAIBA', 'New Atlantic Independent Booksellers Association', 'na'),
  ('NEIBA', 'New England Independent Booksellers Association', 'ne')
ON CONFLICT (abbreviation) DO NOTHING;

-- Enable RLS on regions table
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

-- Public read access for regions
CREATE POLICY "Allow public read access to regions"
  ON public.regions
  FOR SELECT
  USING (true);

-- Grant SELECT to anon and authenticated users
GRANT SELECT ON public.regions TO anon, authenticated;

COMMENT ON TABLE public.regions IS 'Reference table for supported bookseller association regions';

-- ============================================================================
-- Add foreign key constraints (optional, can be added later)
-- ============================================================================
-- Uncomment to enforce referential integrity:
-- ALTER TABLE public.bestseller_list_metadata
--   ADD CONSTRAINT fk_metadata_region
--   FOREIGN KEY (region) REFERENCES public.regions(abbreviation);
--
-- ALTER TABLE public.book_audiences
--   ADD CONSTRAINT fk_audiences_region
--   FOREIGN KEY (region) REFERENCES public.regions(abbreviation);
--
-- ALTER TABLE public.bestseller_switches
--   ADD CONSTRAINT fk_switches_region
--   FOREIGN KEY (region) REFERENCES public.regions(abbreviation);
