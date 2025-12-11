-- Migration: Recreate job tracking tables
-- Author: Secure Backend Deployment
-- Date: 2025-10-20
-- Description: Recreate job_run_history and bestseller_list_metadata tables
--              (were accidentally dropped by rollback migration)

-- ============================================================================
-- Table: job_run_history
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.job_run_history (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'running', 'skipped_no_new_data')),
  error_message TEXT,
  metadata JSONB,
  weeks_processed INTEGER DEFAULT 0,
  books_inserted INTEGER DEFAULT 0,
  books_updated INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_job_run_history_job_name ON public.job_run_history(job_name);
CREATE INDEX IF NOT EXISTS idx_job_run_history_started_at ON public.job_run_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_run_history_status ON public.job_run_history(status);

-- Enable RLS
ALTER TABLE public.job_run_history ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for monitoring dashboard)
CREATE POLICY "Allow public read access to job history"
  ON public.job_run_history
  FOR SELECT
  USING (true);

-- Only service_role can insert/update
-- (service_role bypasses RLS, but documenting intent)

COMMENT ON TABLE public.job_run_history IS 'Tracks execution history of scheduled jobs (cron + manual). Public read, service_role write.';
COMMENT ON COLUMN public.job_run_history.status IS 'Job status: success, error, running, skipped_no_new_data';
COMMENT ON COLUMN public.job_run_history.metadata IS 'JSON metadata about the job run (checksums, weeks processed, etc.)';

-- ============================================================================
-- Table: bestseller_list_metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bestseller_list_metadata (
  id BIGSERIAL PRIMARY KEY,
  week_date DATE NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  checksum TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_books INTEGER NOT NULL DEFAULT 0,
  categories JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_bestseller_list_metadata_week_date ON public.bestseller_list_metadata(week_date DESC);
CREATE INDEX IF NOT EXISTS idx_bestseller_list_metadata_checksum ON public.bestseller_list_metadata(checksum);

-- Enable RLS
ALTER TABLE public.bestseller_list_metadata ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to list metadata"
  ON public.bestseller_list_metadata
  FOR SELECT
  USING (true);

COMMENT ON TABLE public.bestseller_list_metadata IS 'Metadata about bestseller lists (checksums, fetch times). Public read, service_role write.';
COMMENT ON COLUMN public.bestseller_list_metadata.checksum IS 'SHA-256 checksum of raw list data for duplicate detection';

-- ============================================================================
-- Create trigger for updated_at timestamp
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_bestseller_list_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bestseller_list_metadata_timestamp
  BEFORE UPDATE ON public.bestseller_list_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.update_bestseller_list_metadata_timestamp();

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE 'Successfully recreated job tracking tables';
  RAISE NOTICE 'Tables: job_run_history, bestseller_list_metadata';
  RAISE NOTICE 'RLS enabled, public read access granted';
END $$;
