-- Migration: Fix nightly metrics cron to use app_config credentials
-- Date: 2026-02-17
-- Description: The update-book-metrics-nightly cron job uses current_setting()
--   for credentials, which was never configured. All other cron jobs were migrated
--   to read from the app_config table (migration 20251020200100). This migration
--   brings the metrics cron in line with that approach.
--
-- Impact: Fixes nightly aggregation of weekly_scores → book_performance_metrics
--   and book_regional_performance. Without this, 2026 metrics data is never generated.

-- Unschedule the broken job
DO $$
BEGIN
  PERFORM cron.unschedule('update-book-metrics-nightly');
  RAISE NOTICE 'Unscheduled old update-book-metrics-nightly job';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'update-book-metrics-nightly does not exist, skipping';
END $$;

-- Reschedule with app_config credentials (matching pattern from 20251020200100)
SELECT cron.schedule(
  'update-book-metrics-nightly',
  '0 10 * * *',  -- Daily at 10:00 UTC (2am PT)
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/update-book-metrics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := jsonb_build_object('year', EXTRACT(YEAR FROM CURRENT_DATE)::integer)
  ) AS request_id;
  $$
);
