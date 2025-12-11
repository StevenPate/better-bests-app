-- Migration: Setup pg_cron jobs for PNBA bestseller list fetching
-- Author: Secure Backend Scraping Project
-- Date: 2025-10-16
-- Description: Creates multiple scheduled jobs throughout Wednesday to handle variable release times

-- ============================================================================
-- IMPORTANT: Variable Release Times + Business Requirements
-- ============================================================================
-- bookweb.org releases new lists on Wednesdays, but the time varies:
-- - Sometimes as early as 7 AM PT
-- - Sometimes as late as noon PT or later
--
-- BUSINESS CRITICAL: PBN employees need this data ASAP to order more copies
-- of books that just hit the bestseller lists. Early detection = competitive advantage.
--
-- Solution: Aggressive early-morning polling (8:30 AM - 10:15 AM PT)
-- The edge function checks checksums, so duplicate processing is prevented.
-- First successful run wins, subsequent runs skip (status: 'skipped_no_new_data').
-- ============================================================================

-- ============================================================================
-- CRITICAL: Enable Required PostgreSQL Extensions
-- ============================================================================
-- Both extensions MUST be enabled before this migration runs:

-- 1. pg_cron - For scheduled jobs (requires Supabase Pro plan)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. pg_net - For HTTP requests from database (net.http_post calls)
--    WITHOUT THIS, cron jobs will fail with: "ERROR: schema net does not exist"
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Verify both extensions are enabled
DO $$
DECLARE
  cron_version TEXT;
  net_version TEXT;
BEGIN
  SELECT extversion INTO cron_version FROM pg_extension WHERE extname = 'pg_cron';
  SELECT extversion INTO net_version FROM pg_extension WHERE extname = 'pg_net';

  IF cron_version IS NULL THEN
    RAISE EXCEPTION 'pg_cron extension is not enabled. Enable it first!';
  END IF;

  IF net_version IS NULL THEN
    RAISE EXCEPTION 'pg_net extension is not enabled. Enable it first!';
  END IF;

  RAISE NOTICE 'Extensions verified: pg_cron v%, pg_net v%', cron_version, net_version;
END $$;
-- ============================================================================

-- Helper: Get current service role key (stored in vault or config)
-- Note: You'll need to set this via Supabase dashboard or vault
-- For now, we use a placeholder that you must replace

-- ============================================================================
-- NOTE ON TIME ZONES:
-- Pacific Time switches between PST (UTC-8) and PDT (UTC-7) due to DST.
-- These times are set for PDT (March-November), which is when most of the year is.
-- During PST (November-March), times will be 1 hour later.
-- ============================================================================

-- ============================================================================
-- Schedule Job #1: Wednesday 8:30 AM PST/PDT
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-0830',
  '30 15 * * 3',  -- 8:30 AM PDT = 15:30 UTC (or 16:30 UTC during PST)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #2: Wednesday 9:00 AM PST/PDT
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-0900',
  '0 16 * * 3',  -- 9:00 AM PDT = 16:00 UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #3: Wednesday 9:30 AM PST/PDT
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-0930',
  '30 16 * * 3',  -- 9:30 AM PDT = 16:30 UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #4: Wednesday 9:45 AM PST/PDT
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-0945',
  '45 16 * * 3',  -- 9:45 AM PDT = 16:45 UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #5: Wednesday 10:00 AM PST/PDT
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-1000',
  '0 17 * * 3',  -- 10:00 AM PDT = 17:00 UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #6: Wednesday 10:15 AM PST/PDT
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-1015',
  '15 17 * * 3',  -- 10:15 AM PDT = 17:15 UTC
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #7: Wednesday 2:00 PM PST/PDT (Safety Net)
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-1400',
  '0 21 * * 3',  -- 2:00 PM PDT = 21:00 UTC (safety net for late releases)
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Verify cron jobs are scheduled
-- ============================================================================
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname LIKE 'fetch-pnba-bestsellers%'
ORDER BY schedule;

-- ============================================================================
-- Manual Configuration Steps (MUST DO BEFORE RUNNING THIS MIGRATION)
-- ============================================================================
-- You must set these configuration parameters in Supabase:
--
-- 1. Via SQL:
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://<your-project-ref>.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';
--
-- 2. Or via Supabase Dashboard:
-- Settings > Database > Custom Postgres Config
--
-- 3. Reload config:
-- SELECT pg_reload_conf();
--
-- ============================================================================

-- ============================================================================
-- How to Monitor
-- ============================================================================
-- Check cron job history:
-- SELECT * FROM cron.job_run_details WHERE jobid IN (
--   SELECT jobid FROM cron.job WHERE jobname LIKE 'fetch-pnba-bestsellers%'
-- ) ORDER BY start_time DESC LIMIT 20;
--
-- Check edge function job results:
-- SELECT * FROM job_run_history
-- WHERE job_name = 'fetch-pnba-bestsellers'
-- ORDER BY started_at DESC
-- LIMIT 10;
--
-- Expected behavior each Wednesday:
-- - 8:30 AM: First attempt (catches very early releases)
-- - 9:00 AM: Second attempt (most common release time window)
-- - 9:30 AM: Third attempt
-- - 9:45 AM: Fourth attempt
-- - 10:00 AM: Fifth attempt
-- - 10:15 AM: Sixth attempt (should catch 95%+ of releases)
-- - 2:00 PM: Final safety net for unusually late releases
-- - Once one succeeds, all later attempts will show status 'skipped_no_new_data'
--
-- BUSINESS VALUE: Early detection means PBN staff can order books sooner,
-- increasing availability for customers and maximizing sales opportunities.
-- ============================================================================

-- ============================================================================
-- How to Unschedule (Rollback)
-- ============================================================================
-- To remove all scheduled jobs:
-- SELECT cron.unschedule('fetch-pnba-bestsellers-0830');
-- SELECT cron.unschedule('fetch-pnba-bestsellers-0900');
-- SELECT cron.unschedule('fetch-pnba-bestsellers-0930');
-- SELECT cron.unschedule('fetch-pnba-bestsellers-0945');
-- SELECT cron.unschedule('fetch-pnba-bestsellers-1000');
-- SELECT cron.unschedule('fetch-pnba-bestsellers-1015');
-- SELECT cron.unschedule('fetch-pnba-bestsellers-1400');
-- ============================================================================

COMMENT ON EXTENSION pg_cron IS 'Scheduled jobs for PNBA bestseller list fetching. Multiple attempts handle variable release times.';
