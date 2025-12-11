-- ROLLBACK Migration: Undo secure backend scraping changes
-- Author: Secure Backend Scraping Project
-- Date: 2025-10-16
-- Description: Rollback script to undo database changes if needed
-- ⚠️  WARNING: Only use this if you need to roll back to the previous state

-- ============================================================================
-- INSTRUCTIONS FOR ROLLBACK:
-- ============================================================================
-- To rollback the secure backend changes, run this migration manually:
-- 1. Connect to your Supabase database
-- 2. Execute this entire file as a transaction
-- 3. Verify that the old policies are restored
--
-- NOTE: This will restore the INSECURE public INSERT policy!
-- Only use this as a temporary measure if the new system is not working.
-- ============================================================================

-- Begin transaction
BEGIN;

-- ============================================================================
-- Step 1: Drop new tables and related objects
-- ============================================================================

-- Drop triggers first (before dropping tables)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bestseller_list_metadata') THEN
    DROP TRIGGER IF EXISTS trigger_update_bestseller_list_metadata_timestamp ON public.bestseller_list_metadata;
  END IF;
END $$;

-- Drop functions
DROP FUNCTION IF EXISTS public.update_bestseller_list_metadata_timestamp();
DROP FUNCTION IF EXISTS public.is_service_role();

-- Drop tables (CASCADE will drop remaining dependent objects)
DROP TABLE IF EXISTS public.job_run_history CASCADE;
DROP TABLE IF EXISTS public.bestseller_list_metadata CASCADE;

-- ============================================================================
-- Step 2: Drop new indexes
-- ============================================================================

DROP INDEX IF EXISTS public.idx_book_positions_week_category;
DROP INDEX IF EXISTS public.idx_book_positions_isbn_week_desc;
DROP INDEX IF EXISTS public.idx_book_positions_week_isbn;
DROP INDEX IF EXISTS public.idx_book_positions_title_trgm;
DROP INDEX IF EXISTS public.idx_book_positions_author_trgm;
DROP INDEX IF EXISTS public.idx_book_audiences_audience;
DROP INDEX IF EXISTS public.idx_fetch_cache_key_fetched;
DROP INDEX IF EXISTS public.idx_fetch_cache_recent;

-- ============================================================================
-- Step 3: Restore old RLS policies (INSECURE!)
-- ============================================================================

-- Restore public INSERT on book_positions (⚠️  SECURITY VULNERABILITY!)
CREATE POLICY "Allow public insert access to book positions"
  ON public.book_positions
  FOR INSERT
  WITH CHECK (true);

-- Remove the secure read-only policies we created
DROP POLICY IF EXISTS "Allow public read access to book audiences" ON public.book_audiences;
DROP POLICY IF EXISTS "Allow public read access to fetch cache" ON public.fetch_cache;

-- Note: If there were other policies before, they would need to be restored here
-- This rollback assumes we're going back to the state before the secure backend changes

-- ============================================================================
-- Step 4: Clean up comments
-- ============================================================================

COMMENT ON TABLE public.book_positions IS NULL;
COMMENT ON TABLE public.book_audiences IS NULL;
COMMENT ON TABLE public.fetch_cache IS NULL;

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  RAISE WARNING 'ROLLBACK COMPLETE: Database restored to insecure state';
  RAISE WARNING 'The public INSERT policy on book_positions has been restored';
  RAISE WARNING 'This is a SECURITY VULNERABILITY - migrate to secure backend ASAP';
END $$;

-- Commit transaction
COMMIT;

-- ============================================================================
-- Post-Rollback Actions
-- ============================================================================

-- TODO: If you rolled back the migrations, you should also:
-- 1. Stop or remove the backend scraping edge function (fetch-pnba-lists)
-- 2. Stop or remove the pg_cron job
-- 3. Restore any client-side scraping code that was removed
-- 4. Update frontend to use old BestsellerParser instead of new API
-- 5. Document why the rollback was necessary and plan to fix issues
