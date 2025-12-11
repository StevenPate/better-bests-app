-- Migration: Add tables for secure backend scraping
-- Author: Secure Backend Scraping Project
-- Date: 2025-10-16
-- Description: Creates job_run_history and bestseller_list_metadata tables

-- ============================================================================
-- Table: job_run_history
-- Purpose: Track backend job executions for monitoring and debugging
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.job_run_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'timeout')),
  weeks_processed INTEGER DEFAULT 0,
  books_inserted INTEGER DEFAULT 0,
  books_updated INTEGER DEFAULT 0,
  error_message TEXT,
  error_details JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for job_run_history
CREATE INDEX IF NOT EXISTS idx_job_history_name
  ON public.job_run_history(job_name);

CREATE INDEX IF NOT EXISTS idx_job_history_started
  ON public.job_run_history(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_history_status
  ON public.job_run_history(status, started_at DESC);

-- Enable RLS on job_run_history (service role only)
ALTER TABLE public.job_run_history ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can read/write (no public access)
-- Note: service_role bypasses RLS, but we document the intent
COMMENT ON TABLE public.job_run_history IS 'Backend job execution history. Service role access only.';

-- ============================================================================
-- Table: bestseller_list_metadata
-- Purpose: Track metadata about each fetched bestseller list
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bestseller_list_metadata (
  week_date DATE PRIMARY KEY,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_url TEXT NOT NULL,
  checksum TEXT, -- SHA256 of raw content for change detection
  book_count INTEGER,
  category_count INTEGER,
  comparison_week_date DATE,
  is_current_week BOOLEAN DEFAULT FALSE,
  fetch_duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for bestseller_list_metadata
CREATE INDEX IF NOT EXISTS idx_metadata_fetched_at
  ON public.bestseller_list_metadata(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_metadata_current
  ON public.bestseller_list_metadata(is_current_week, week_date DESC)
  WHERE is_current_week = TRUE;

-- Enable RLS on bestseller_list_metadata
ALTER TABLE public.bestseller_list_metadata ENABLE ROW LEVEL SECURITY;

-- Policy: Public can read metadata (shows data freshness)
CREATE POLICY "Allow public read access to list metadata"
  ON public.bestseller_list_metadata
  FOR SELECT
  USING (true);

-- Policy: Only service role can write (enforced by RLS + no INSERT policy for anon/authenticated)
COMMENT ON TABLE public.bestseller_list_metadata IS 'Metadata about bestseller lists. Public read, service role write only.';

-- ============================================================================
-- Function: Update updated_at timestamp on bestseller_list_metadata
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_bestseller_list_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at on bestseller_list_metadata
CREATE TRIGGER trigger_update_bestseller_list_metadata_timestamp
  BEFORE UPDATE ON public.bestseller_list_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.update_bestseller_list_metadata_timestamp();

-- ============================================================================
-- Grant permissions
-- ============================================================================
-- Grant SELECT to anon and authenticated users for metadata table
GRANT SELECT ON public.bestseller_list_metadata TO anon, authenticated;

-- No grants for job_run_history (service role only)
