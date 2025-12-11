/**
 * Set up Supabase cron job for nightly book metrics updates
 *
 * Runs update-book-metrics edge function daily at 2am PT (10am UTC)
 * to aggregate weekly_scores into book_performance_metrics tables.
 *
 * Prerequisites:
 * - pg_cron extension must be enabled (default in Supabase)
 * - update-book-metrics edge function must be deployed
 *
 * Configuration:
 * - Schedule: Daily at 10:00 UTC (2am PT)
 * - Payload: { "year": <current_year> }
 * - Authentication: Uses service role key from vault
 *
 * To verify the job is running:
 *   SELECT * FROM cron.job WHERE jobname = 'update-book-metrics-nightly';
 *   SELECT * FROM cron.job_run_details WHERE jobid = <job_id> ORDER BY start_time DESC LIMIT 10;
 *
 * To manually trigger (for testing):
 *   SELECT cron.schedule('test-metrics', '* * * * *', $
 *     SELECT net.http_post(
 *       url := current_setting('app.settings.api_url') || '/functions/v1/update-book-metrics',
 *       headers := jsonb_build_object(
 *         'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
 *         'Content-Type', 'application/json'
 *       ),
 *       body := jsonb_build_object('year', EXTRACT(YEAR FROM CURRENT_DATE))
 *     );
 *   $);
 *
 * To remove test job:
 *   SELECT cron.unschedule('test-metrics');
 */

-- Ensure pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ⚠️ CRITICAL: Before this migration can work, you MUST configure these settings:
--
-- 1. Set API URL (your Supabase project URL):
--    SELECT set_config('app.settings.api_url', 'https://<project-ref>.supabase.co', false);
--
-- 2. Set Service Role Key (from Supabase dashboard):
--    SELECT set_config('app.settings.service_role_key', '<your-service-role-key>', false);
--
-- The cron job will be created but will FAIL until these are configured.
-- Check job status with:
--    SELECT * FROM cron.job_run_details WHERE jobid = (
--      SELECT jobid FROM cron.job WHERE jobname = 'update-book-metrics-nightly'
--    ) ORDER BY start_time DESC LIMIT 5;

-- Schedule nightly metrics update job
-- Runs daily at 10:00 UTC (2am PT, accounting for PST/PDT)
SELECT cron.schedule(
  'update-book-metrics-nightly',  -- Job name
  '0 10 * * *',  -- Cron expression: daily at 10:00 UTC
  $$
    -- Call the update-book-metrics edge function
    SELECT net.http_post(
      url := current_setting('app.settings.api_url') || '/functions/v1/update-book-metrics',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'year', EXTRACT(YEAR FROM CURRENT_DATE)::integer
      )
    ) AS request_id;
  $$
);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Verification query (run after migration to confirm setup)
-- SELECT jobid, jobname, schedule, active, nodename
-- FROM cron.job
-- WHERE jobname = 'update-book-metrics-nightly';
