-- Migration: Add MIBA Region and Fix SIBA Code
-- Author: MIBA Implementation Project
-- Date: 2025-12-10
-- Description: Adds MIBA as the 9th regional association and corrects SIBA region_code from 'se' to 'si'

-- ============================================================================
-- PART 1: Add MIBA Region
-- ============================================================================

-- Insert MIBA into regions table
INSERT INTO public.regions (abbreviation, full_name, region_code, is_active)
VALUES ('MIBA', 'Midwest Independent Booksellers Association', 'mw', true)
ON CONFLICT (abbreviation) DO NOTHING;

COMMENT ON TABLE public.regions IS 'Reference table for supported bookseller association regions (now includes 9 regions)';

-- ============================================================================
-- PART 2: Fix SIBA Region Code
-- ============================================================================

-- Update SIBA region_code from 'se' to 'si' for consistency with BookWeb.org URL patterns
-- Current state: 'se' (incorrect, set in migration 20251104000000_add_region_support.sql)
-- Correct state: 'si' (matches BookWeb.org URLs like 251203si.txt)
UPDATE public.regions
SET region_code = 'si'
WHERE abbreviation = 'SIBA';

-- ============================================================================
-- Verification Queries (run after migration)
-- ============================================================================

-- Verify MIBA was added:
-- SELECT * FROM regions WHERE abbreviation = 'MIBA';
-- Expected: abbreviation='MIBA', full_name='Midwest Independent Booksellers Association', region_code='mw', is_active=true

-- Verify SIBA was corrected:
-- SELECT * FROM regions WHERE abbreviation = 'SIBA';
-- Expected: abbreviation='SIBA', full_name='Southern Independent Booksellers Alliance', region_code='si', is_active=true

-- Verify total region count:
-- SELECT COUNT(*) FROM regions WHERE is_active = true;
-- Expected: 9 (PNBA, CALIBAN, CALIBAS, GLIBA, MPIBA, NAIBA, NEIBA, SIBA, MIBA)
