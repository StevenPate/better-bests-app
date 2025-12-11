-- Migration: Create regional_bestsellers table for Elsewhere discovery feature
-- Author: Multi-Region Expansion Project - Phase 4
-- Date: 2025-11-05
-- Description: Creates table to track bestseller data across all regions for cross-region comparison

-- ============================================================================
-- Create regional_bestsellers table
-- ============================================================================
-- This table stores bestseller data from all regions to enable the "Elsewhere"
-- discovery feature, which identifies books that are popular in other regions
-- but have never appeared on the selected region's list.

CREATE TABLE IF NOT EXISTS public.regional_bestsellers (
  id SERIAL PRIMARY KEY,
  region VARCHAR(20) NOT NULL,
  isbn VARCHAR(13) NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  publisher TEXT,
  rank INTEGER NOT NULL,
  category VARCHAR(100),
  week_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure a book can only appear once per region per week
  CONSTRAINT regional_bestsellers_region_isbn_week_unique
    UNIQUE(region, isbn, week_date)
);

-- ============================================================================
-- Add indexes for performance
-- ============================================================================
-- Index for filtering by region and ISBN (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_regional_bestsellers_region_isbn
  ON public.regional_bestsellers(region, isbn);

-- Index for filtering by week_date (temporal queries)
CREATE INDEX IF NOT EXISTS idx_regional_bestsellers_week_date
  ON public.regional_bestsellers(week_date DESC);

-- Index for ISBN lookups (finding books across regions)
CREATE INDEX IF NOT EXISTS idx_regional_bestsellers_isbn
  ON public.regional_bestsellers(isbn);

-- Composite index for region and week queries
CREATE INDEX IF NOT EXISTS idx_regional_bestsellers_region_week
  ON public.regional_bestsellers(region, week_date DESC);

-- ============================================================================
-- Add foreign key constraint to regions table (optional, enables referential integrity)
-- ============================================================================
-- Uncomment to enforce that region values must exist in regions table:
-- ALTER TABLE public.regional_bestsellers
--   ADD CONSTRAINT fk_regional_bestsellers_region
--   FOREIGN KEY (region) REFERENCES public.regions(abbreviation);

-- ============================================================================
-- Add table comments
-- ============================================================================
COMMENT ON TABLE public.regional_bestsellers IS
  'Stores bestseller data from all regions for cross-region comparison and Elsewhere discovery feature';

COMMENT ON COLUMN public.regional_bestsellers.region IS
  'Region abbreviation (PNBA, SIBA, GLIBA, etc.)';

COMMENT ON COLUMN public.regional_bestsellers.isbn IS
  'Book ISBN (13-digit format preferred)';

COMMENT ON COLUMN public.regional_bestsellers.rank IS
  'Position on the bestseller list for this week';

COMMENT ON COLUMN public.regional_bestsellers.week_date IS
  'Week ending date for this list';

-- ============================================================================
-- Enable Row Level Security (RLS)
-- ============================================================================
ALTER TABLE public.regional_bestsellers ENABLE ROW LEVEL SECURITY;

-- Create policies only if they don't exist
DO $$
BEGIN
  -- Public read access policy (anyone can read regional bestseller data)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'regional_bestsellers'
    AND policyname = 'Allow public read access to regional bestsellers'
  ) THEN
    CREATE POLICY "Allow public read access to regional bestsellers"
      ON public.regional_bestsellers
      FOR SELECT
      USING (true);
  END IF;

  -- Only authenticated users can insert/update/delete
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'regional_bestsellers'
    AND policyname = 'Allow authenticated users to insert regional bestsellers'
  ) THEN
    CREATE POLICY "Allow authenticated users to insert regional bestsellers"
      ON public.regional_bestsellers
      FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'regional_bestsellers'
    AND policyname = 'Allow authenticated users to update regional bestsellers'
  ) THEN
    CREATE POLICY "Allow authenticated users to update regional bestsellers"
      ON public.regional_bestsellers
      FOR UPDATE
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'regional_bestsellers'
    AND policyname = 'Allow authenticated users to delete regional bestsellers'
  ) THEN
    CREATE POLICY "Allow authenticated users to delete regional bestsellers"
      ON public.regional_bestsellers
      FOR DELETE
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================================================
-- Grant permissions
-- ============================================================================
-- Grant SELECT to anonymous and authenticated users
GRANT SELECT ON public.regional_bestsellers TO anon, authenticated;

-- Grant full access to authenticated users (for data imports)
GRANT INSERT, UPDATE, DELETE ON public.regional_bestsellers TO authenticated;

-- Grant sequence usage for inserts
GRANT USAGE, SELECT ON SEQUENCE public.regional_bestsellers_id_seq TO authenticated;

-- ============================================================================
-- Create materialized view for Elsewhere books (optional, can be added later)
-- ============================================================================
-- This view pre-calculates aggregate metrics for better performance
-- Uncomment to create (requires populated data first):

-- CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_elsewhere_books AS
-- SELECT DISTINCT
--   rb.isbn,
--   rb.title,
--   rb.author,
--   rb.publisher,
--   array_agg(DISTINCT rb.region ORDER BY rb.region) as regions,
--   COUNT(DISTINCT rb.region) as region_count,
--   MIN(rb.rank) as best_rank,
--   COUNT(*) as total_weeks,
--   MAX(rb.week_date) as last_seen_date
-- FROM public.regional_bestsellers rb
-- WHERE rb.week_date >= CURRENT_DATE - INTERVAL '4 weeks'
-- GROUP BY rb.isbn, rb.title, rb.author, rb.publisher;

-- CREATE INDEX IF NOT EXISTS idx_mv_elsewhere_region_count
--   ON public.mv_elsewhere_books(region_count DESC);

-- CREATE INDEX IF NOT EXISTS idx_mv_elsewhere_isbn
--   ON public.mv_elsewhere_books(isbn);

-- COMMENT ON MATERIALIZED VIEW public.mv_elsewhere_books IS
--   'Pre-aggregated view of books appearing across multiple regions in the last 4 weeks';

-- ============================================================================
-- Migration complete
-- ============================================================================
-- Next steps:
-- 1. Populate table with current regional bestseller data
-- 2. Create Edge Function for Elsewhere discovery queries
-- 3. Implement data import/sync process
-- 4. Uncomment materialized view once data is populated
