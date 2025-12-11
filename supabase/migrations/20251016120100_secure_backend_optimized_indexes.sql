-- Migration: Add optimized indexes for secure backend scraping
-- Author: Secure Backend Scraping Project
-- Date: 2025-10-16
-- Description: Creates indexes to optimize frontend API queries and comparison logic

-- ============================================================================
-- Optimized indexes for book_positions table
-- ============================================================================

-- Index for frontend API queries (get books by week + category)
CREATE INDEX IF NOT EXISTS idx_book_positions_week_category
  ON public.book_positions(week_date DESC, category);

-- Index for comparison queries (get all books for an ISBN ordered by week)
CREATE INDEX IF NOT EXISTS idx_book_positions_isbn_week_desc
  ON public.book_positions(isbn, week_date DESC);

-- Composite index for filtering by week + ISBN (for batch lookups)
CREATE INDEX IF NOT EXISTS idx_book_positions_week_isbn
  ON public.book_positions(week_date, isbn);

-- Index for title searches (case-insensitive using GIN)
-- Note: Using pg_trgm extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_book_positions_title_trgm
  ON public.book_positions USING gin (title gin_trgm_ops);

-- Index for author searches (case-insensitive using GIN)
CREATE INDEX IF NOT EXISTS idx_book_positions_author_trgm
  ON public.book_positions USING gin (author gin_trgm_ops);

-- ============================================================================
-- Optimized indexes for book_audiences table
-- ============================================================================

-- Note: book_audiences.isbn is already the PRIMARY KEY, so it has an index
-- We add a covering index that includes the audience value for better query performance
CREATE INDEX IF NOT EXISTS idx_book_audiences_audience
  ON public.book_audiences(audience, isbn);

-- ============================================================================
-- Optimized indexes for fetch_cache table
-- ============================================================================

-- Index for cache lookups by key + freshness
CREATE INDEX IF NOT EXISTS idx_fetch_cache_key_fetched
  ON public.fetch_cache(cache_key, last_fetched DESC);

-- Partial index for recent cache entries (< 7 days old)
-- NOTE: Cannot use NOW() in partial index predicate (not immutable)
-- Using regular index instead (idx_fetch_cache_key_fetched above covers this use case)
-- CREATE INDEX IF NOT EXISTS idx_fetch_cache_recent
--   ON public.fetch_cache(last_fetched DESC)
--   WHERE last_fetched > (NOW() - INTERVAL '7 days');

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON INDEX idx_book_positions_week_category IS 'Optimizes frontend queries for books by week and category';
COMMENT ON INDEX idx_book_positions_isbn_week_desc IS 'Optimizes comparison queries and historical lookups by ISBN';
COMMENT ON INDEX idx_book_positions_title_trgm IS 'Enables fuzzy text search on book titles';
COMMENT ON INDEX idx_book_positions_author_trgm IS 'Enables fuzzy text search on authors';
