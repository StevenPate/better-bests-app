-- Fix RLS for fetch_cache table to allow anonymous reads
-- This ensures frontend can read cached data

-- Enable RLS on fetch_cache table
ALTER TABLE IF EXISTS fetch_cache ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow anonymous reads on fetch_cache" ON fetch_cache;
DROP POLICY IF EXISTS "Allow service role full access on fetch_cache" ON fetch_cache;
DROP POLICY IF EXISTS "Enable read access for all users" ON fetch_cache;

-- Create policy to allow anonymous and authenticated users to read cache
CREATE POLICY "Enable read access for all users"
ON fetch_cache
FOR SELECT
TO anon, authenticated
USING (true);

-- Create policy for service role to have full access (for edge functions)
CREATE POLICY "Allow service role full access on fetch_cache"
ON fetch_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add comment explaining the policies
COMMENT ON TABLE fetch_cache IS 'Cache table for PNBA bestseller data. RLS enabled with read access for all users, write access for service role only.';