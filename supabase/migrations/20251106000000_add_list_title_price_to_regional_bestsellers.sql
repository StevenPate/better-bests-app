-- Migration: Add list_title and price columns to regional_bestsellers
-- Author: Historical Data Implementation - Multi-Region Expansion
-- Date: 2025-11-06
-- Description: Adds list_title and price columns to enable full feature parity with book_positions

-- ============================================================================
-- Add list_title column
-- ============================================================================
-- This column stores the display name for the bestseller list (e.g., "PNBA Independent Bestsellers")
-- Nullable to support historical data and gradual migration
ALTER TABLE public.regional_bestsellers
ADD COLUMN IF NOT EXISTS list_title TEXT;

COMMENT ON COLUMN public.regional_bestsellers.list_title IS
  'Display name for the bestseller list (e.g., "PNBA Independent Bestsellers", "SIBA Bestsellers")';

-- ============================================================================
-- Add price column
-- ============================================================================
-- This column stores the book price as a string (e.g., "$16.99", "$28.00")
-- Nullable because not all sources provide price data
ALTER TABLE public.regional_bestsellers
ADD COLUMN IF NOT EXISTS price TEXT;

COMMENT ON COLUMN public.regional_bestsellers.price IS
  'Book price as displayed in the source list (e.g., "$16.99"). May be null if not provided.';

-- ============================================================================
-- Backfill existing PNBA data with list_title
-- ============================================================================
-- Update any existing PNBA rows to have the standard list title
UPDATE public.regional_bestsellers
SET list_title = 'PNBA Independent Bestsellers'
WHERE region = 'PNBA' AND list_title IS NULL;

-- Backfill other regions with standard format (if data exists)
UPDATE public.regional_bestsellers
SET list_title = region || ' Independent Bestsellers'
WHERE list_title IS NULL AND region IS NOT NULL;

-- ============================================================================
-- Create index for list_title queries (optional, for filtering/grouping)
-- ============================================================================
-- Only create if we expect to filter by list_title frequently
-- CREATE INDEX IF NOT EXISTS idx_regional_bestsellers_list_title
--   ON public.regional_bestsellers(list_title);

-- ============================================================================
-- Migration complete
-- ============================================================================
-- Note: price column will remain NULL for historical data unless backfilled
-- from book_positions or re-fetched from source
