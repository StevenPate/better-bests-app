-- Allow anonymous access to book_positions table for reading and writing
ALTER TABLE book_positions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow all operations on book_positions" ON book_positions;

-- Create a permissive policy that allows all operations for authenticated and anonymous users
CREATE POLICY "Allow all operations on book_positions" ON book_positions
FOR ALL 
USING (true)
WITH CHECK (true);

-- Create a cache table to track when data was last fetched
CREATE TABLE IF NOT EXISTS public.fetch_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  last_fetched TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS for cache table
ALTER TABLE fetch_cache ENABLE ROW LEVEL SECURITY;

-- Allow all operations on cache table
CREATE POLICY "Allow all operations on fetch_cache" ON fetch_cache
FOR ALL 
USING (true)
WITH CHECK (true);