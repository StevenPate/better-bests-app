-- Migration: Add cron job for weekly regional bestseller updates
-- Author: Regional Data Sync Fix
-- Date: 2025-12-02
-- Description: Schedules weekly population of regional_bestsellers table
--
-- This runs every Wednesday at 10:15 AM PDT (17:15 UTC) to ensure all
-- regional lists are available (they publish at the same time as PNBA)

-- ============================================================================
-- PREREQUISITES
-- ============================================================================
-- 1. populate-regional-bestsellers edge function must be deployed
-- 2. app_config table must have supabase_url and service_role_key configured
-- 3. pg_cron and pg_net extensions must be enabled

-- ============================================================================
-- Schedule Weekly Regional Data Population
-- ============================================================================
-- Runs Wednesdays at 17:15 UTC (10:15 AM PDT/PST)
-- This is 15 minutes after the last PNBA fetch attempt, ensuring lists are available

SELECT cron.schedule(
  'populate-regional-bestsellers-weekly',  -- Job name
  '15 17 * * 3',  -- Cron expression: Wednesdays at 17:15 UTC
  $$
    -- Call the populate-regional-bestsellers edge function
    SELECT net.http_post(
      url := (SELECT value FROM app_config WHERE key = 'supabase_url') || '/functions/v1/populate-regional-bestsellers',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT value FROM app_config WHERE key = 'service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'weeks', 1  -- Populate current week only
      )
    ) AS request_id;

    -- Log the job execution
    INSERT INTO job_run_history (
      job_name,
      started_at,
      status,
      metadata
    ) VALUES (
      'populate-regional-bestsellers',
      NOW(),
      'running',
      jsonb_build_object(
        'weeks', 1,
        'scheduled_run', true
      )
    );
  $$
);

-- ============================================================================
-- Add a second attempt 30 minutes later (in case of temporary failures)
-- ============================================================================
-- Runs Wednesdays at 17:45 UTC (10:45 AM PDT/PST)

SELECT cron.schedule(
  'populate-regional-bestsellers-retry',  -- Job name
  '45 17 * * 3',  -- Cron expression: Wednesdays at 17:45 UTC
  $$
    -- Check if we already have data for this week
    DECLARE
      current_week_date DATE;
      data_exists BOOLEAN;
    BEGIN
      -- Calculate current week's Wednesday
      current_week_date := date_trunc('week', CURRENT_DATE - INTERVAL '3 days')::date + 3;

      -- Check if we already have regional data for this week
      SELECT EXISTS (
        SELECT 1 FROM regional_bestsellers
        WHERE week_date = current_week_date
        LIMIT 1
      ) INTO data_exists;

      -- Only run if data doesn't exist
      IF NOT data_exists THEN
        -- Call the edge function
        PERFORM net.http_post(
          url := (SELECT value FROM app_config WHERE key = 'supabase_url') || '/functions/v1/populate-regional-bestsellers',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || (SELECT value FROM app_config WHERE key = 'service_role_key'),
            'Content-Type', 'application/json'
          ),
          body := jsonb_build_object(
            'weeks', 1  -- Populate current week only
          )
        );

        -- Log the retry attempt
        INSERT INTO job_run_history (
          job_name,
          started_at,
          status,
          metadata
        ) VALUES (
          'populate-regional-bestsellers-retry',
          NOW(),
          'running',
          jsonb_build_object(
            'weeks', 1,
            'scheduled_run', true,
            'is_retry', true
          )
        );
      ELSE
        -- Log that data already exists
        INSERT INTO job_run_history (
          job_name,
          started_at,
          completed_at,
          status,
          metadata
        ) VALUES (
          'populate-regional-bestsellers-retry',
          NOW(),
          NOW(),
          'skipped_no_new_data',
          jsonb_build_object(
            'reason', 'Data already exists for current week',
            'week_date', current_week_date
          )
        );
      END IF;
    END;
  $$
);

-- ============================================================================
-- Verification
-- ============================================================================
-- To verify the jobs are scheduled:
-- SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'populate-regional%';

-- To check job execution history:
-- SELECT * FROM cron.job_run_details
-- WHERE jobid IN (
--   SELECT jobid FROM cron.job WHERE jobname LIKE 'populate-regional%'
-- )
-- ORDER BY start_time DESC LIMIT 10;

-- To manually trigger for testing:
-- SELECT cron.schedule('test-regional', '* * * * *', $$
--   SELECT net.http_post(...)
-- $$);
-- Then: SELECT cron.unschedule('test-regional');

COMMENT ON TABLE regional_bestsellers IS 'Stores bestseller data from all 8 regional bookseller associations. Updated weekly via cron job.';

-- Grant necessary permissions (if not already granted)
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;