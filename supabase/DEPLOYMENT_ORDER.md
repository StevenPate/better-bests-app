# Supabase Deployment Order

**CRITICAL:** Follow this exact order to prevent data integrity issues.

## Phase 1: Database Schema Setup

Apply migrations in order (Supabase applies them automatically in filename order):

1. `20251108120000_create_weekly_scores.sql` - Creates weekly_scores table
2. `20251108120100_create_book_performance_metrics.sql` - Creates metrics aggregation table
3. `20251108120200_create_book_regional_performance.sql` - Creates regional breakdown table
4. `20251108120300_create_scoring_function.sql` - Creates PostgreSQL scoring function
5. **`20251108140000_fix_null_categories.sql`** ⚠️ **CRITICAL - Must run BEFORE backfill**
6. `20251108130000_setup_metrics_cron.sql` - Sets up nightly cron job
7. **`20251109200000_create_distinct_books_view.sql`** - Creates view for unique book metadata (solves "Unknown" books issue)

```bash
npx supabase db push
```

**⚠️ IMPORTANT:** Migration `20251108140000_fix_null_categories.sql` adds a NOT NULL constraint to the `category` column. This prevents duplicate rows from being created when category is NULL (PostgreSQL treats NULL as distinct in UNIQUE constraints).

**If you run the backfill BEFORE this migration:**
- Duplicate rows will be created for books without categories
- Performance metrics will be overstated (double-counting)
- You'll need to manually clean up duplicates

## Phase 2: Edge Functions Deployment

Deploy edge functions in this order:

```bash
# 1. Score calculator (used by other functions)
npx supabase functions deploy calculate-weekly-scores

# 2. One-time backfill (populates historical 2025 data)
npx supabase functions deploy backfill-2025-scores

# 3. Metrics aggregation (nightly job)
npx supabase functions deploy update-book-metrics
```

## Phase 3: Configure Cron Job Settings

Before the cron job can run, configure these settings in Supabase:

```sql
-- Set your project URL
SELECT set_config('app.settings.api_url', 'https://<your-project>.supabase.co', false);

-- Set your service role key (from Supabase dashboard > Settings > API)
SELECT set_config('app.settings.service_role_key', '<your-service-role-key>', false);
```

Verify cron job is scheduled:
```sql
SELECT jobid, jobname, schedule, active, nodename
FROM cron.job
WHERE jobname = 'update-book-metrics-nightly';
```

## Phase 4: Initial Data Population

Run these in order to populate the system:

```bash
# 1. Backfill all 2025 weekly scores
curl -X POST https://<project>.supabase.co/functions/v1/backfill-2025-scores \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json"

# 2. Calculate aggregate metrics for 2025
curl -X POST https://<project>.supabase.co/functions/v1/update-book-metrics \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"year": 2025}'
```

## Phase 5: Verify Data

Check that data populated correctly:

```sql
-- Check weekly_scores (should have thousands of rows)
SELECT COUNT(*), MIN(week_date), MAX(week_date)
FROM weekly_scores;

-- Verify no NULL categories (should be 0)
SELECT COUNT(*) FROM weekly_scores WHERE category IS NULL;

-- Check metrics were calculated
SELECT COUNT(*) FROM book_performance_metrics WHERE year = 2025;

-- Check regional breakdowns
SELECT COUNT(*) FROM book_regional_performance WHERE year = 2025;

-- Sample top performers
SELECT isbn, total_score, weeks_on_chart, regions_appeared
FROM book_performance_metrics
WHERE year = 2025
ORDER BY total_score DESC
LIMIT 10;
```

## Troubleshooting

**Issue:** Cron job fails with "Failed to connect"
**Solution:** Verify `app.settings.api_url` and `app.settings.service_role_key` are set correctly

**Issue:** Duplicate rows in weekly_scores
**Solution:** Migration `20251108140000_fix_null_categories.sql` was not applied before backfill
**Fix:**
```sql
-- Apply the migration
\i supabase/migrations/20251108140000_fix_null_categories.sql

-- Clean up duplicates (keep newest by created_at)
DELETE FROM weekly_scores a
USING weekly_scores b
WHERE a.isbn = b.isbn
  AND a.region = b.region
  AND a.week_date = b.week_date
  AND (a.category = b.category OR (a.category IS NULL AND b.category IS NULL))
  AND a.id < b.id;

-- Re-run metrics aggregation
-- (Edge function will fetch fresh data)
```

**Issue:** Performance metrics show inflated scores
**Solution:** See duplicate cleanup above, then re-run `update-book-metrics`
