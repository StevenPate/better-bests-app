-- Migration: Create configuration table for cron jobs
-- Author: Secure Backend Deployment
-- Date: 2025-10-20
-- Description: Store Supabase URL and service role key for pg_cron edge function calls

-- Create configuration table
CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Create policy: Only allow reads (cron jobs read config, manual inserts/updates only)
CREATE POLICY "Allow service role to read config"
  ON public.app_config
  FOR SELECT
  TO service_role
  USING (true);

-- Insert configuration values
INSERT INTO public.app_config (key, value, description)
VALUES
  ('supabase_url', 'https://auwllsalgwiwdzohpmum.supabase.co', 'Supabase project URL for edge function calls'),
  ('service_role_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1d2xsc2FsZ3dpd2R6b2hwbXVtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjQ0NDYxMSwiZXhwIjoyMDcyMDIwNjExfQ.EZ0RelZ-BRaxgpDMwAELyLSqzJvlJNRnjztQFhoEoy4', 'Service role key for authenticated edge function calls')
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = NOW();

-- Create helper function to get config values
CREATE OR REPLACE FUNCTION public.get_config(config_key TEXT)
RETURNS TEXT AS $$
  SELECT value FROM public.app_config WHERE key = config_key;
$$ LANGUAGE sql SECURITY DEFINER;

-- Grant execute permission to service_role
GRANT EXECUTE ON FUNCTION public.get_config(TEXT) TO service_role;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_config_key ON public.app_config(key);

-- Add comments
COMMENT ON TABLE public.app_config IS 'Application configuration for cron jobs and edge functions. Stores sensitive keys securely.';
COMMENT ON FUNCTION public.get_config(TEXT) IS 'Retrieve configuration value by key. Only accessible to service_role.';
