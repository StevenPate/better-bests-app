-- Migration: Update cron jobs to use config table instead of current_setting
-- Author: Secure Backend Deployment
-- Date: 2025-10-20
-- Description: Replace cron jobs to use app_config table for credentials

-- ============================================================================
-- PREREQUISITES: Required PostgreSQL Extensions & Configuration
-- ============================================================================
-- This migration requires:
--
-- 1. pg_cron extension enabled (for scheduled jobs)
-- 2. pg_net extension enabled (for net.http_post calls)
--    WITHOUT pg_net, jobs will fail with: "ERROR: schema net does not exist"
--
-- 3. app_config table populated with:
--    - supabase_url (e.g., 'https://xxx.supabase.co')
--    - service_role_key (your Supabase service role key)
--
-- Verify prerequisites:
-- SELECT extname FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');
-- SELECT key FROM app_config WHERE key IN ('supabase_url', 'service_role_key');
-- ============================================================================

-- First, unschedule all existing cron jobs (ignore errors if they don't exist)
DO $$
DECLARE
  job_names TEXT[] := ARRAY[
    'fetch-pnba-bestsellers-0830',
    'fetch-pnba-bestsellers-0900',
    'fetch-pnba-bestsellers-0930',
    'fetch-pnba-bestsellers-0945',
    'fetch-pnba-bestsellers-1000',
    'fetch-pnba-bestsellers-1015',
    'fetch-pnba-bestsellers-1100',
    'fetch-pnba-bestsellers-1500'
  ];
  job_name TEXT;
BEGIN
  FOREACH job_name IN ARRAY job_names
  LOOP
    BEGIN
      PERFORM cron.unschedule(job_name);
      RAISE NOTICE 'Unscheduled job: %', job_name;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Job % does not exist, skipping unschedule', job_name;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- Schedule Job #1: Wednesday 8:30 AM PDT (15:30 UTC)
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-0830',
  '30 15 * * 3',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #2: Wednesday 9:00 AM PDT (16:00 UTC)
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-0900',
  '0 16 * * 3',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #3: Wednesday 9:30 AM PDT (16:30 UTC)
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-0930',
  '30 16 * * 3',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #4: Wednesday 9:45 AM PDT (16:45 UTC)
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-0945',
  '45 16 * * 3',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #5: Wednesday 10:00 AM PDT (17:00 UTC)
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-1000',
  '0 17 * * 3',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #6: Wednesday 10:15 AM PDT (17:15 UTC)
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-1015',
  '15 17 * * 3',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #7: Wednesday 11:00 AM PDT (18:00 UTC) - Backup run
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-1100',
  '0 18 * * 3',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Schedule Job #8: Wednesday 3:00 PM PDT (22:00 UTC) - Final safety run
-- ============================================================================
SELECT cron.schedule(
  'fetch-pnba-bestsellers-1500',
  '0 22 * * 3',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.app_config WHERE key = 'supabase_url') || '/functions/v1/fetch-pnba-lists',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT value FROM public.app_config WHERE key = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================================
-- Verification: List all cron jobs
-- ============================================================================
DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname LIKE 'fetch-pnba-bestsellers-%';

  RAISE NOTICE 'Successfully scheduled % cron jobs for PNBA bestseller fetching', job_count;
  RAISE NOTICE 'Jobs will run every Wednesday throughout the morning';
  RAISE NOTICE 'Using config from app_config table (secure approach)';
END $$;
