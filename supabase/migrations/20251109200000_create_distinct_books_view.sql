/**
 * Create view for distinct book metadata
 *
 * The regional_bestsellers table has ~400 rows per ISBN (50 weeks × 8 regions).
 * This view provides one row per unique ISBN with title/author, solving the
 * "Unknown" book issue in the awards rankings.
 *
 * Why we need this:
 * - Supabase/PostgREST has a 1000 row hard limit
 * - Awards rankings request 10-20 ISBNs
 * - Each ISBN has ~400 duplicate rows
 * - Result: Only 2-3 ISBNs fit in 1000 rows → rest show as "Unknown"
 *
 * With this view, querying 20 ISBNs returns exactly 20 rows.
 */

CREATE OR REPLACE VIEW distinct_books AS
SELECT DISTINCT ON (isbn)
  isbn,
  title,
  author,
  publisher
FROM regional_bestsellers
ORDER BY isbn, week_date DESC; -- Most recent metadata for each ISBN

-- Add comment
COMMENT ON VIEW distinct_books IS
  'Provides one row per unique ISBN from regional_bestsellers, solving duplicate issues in rankings queries';

-- Grant permissions
GRANT SELECT ON distinct_books TO anon, authenticated;

-- Create index on the underlying table if not exists (for performance)
CREATE INDEX IF NOT EXISTS idx_regional_bestsellers_isbn_metadata
  ON regional_bestsellers(isbn, week_date DESC);
