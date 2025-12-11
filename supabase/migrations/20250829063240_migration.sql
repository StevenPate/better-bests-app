-- Create fetch_cache table for caching external API calls
CREATE TABLE IF NOT EXISTS public.fetch_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  data jsonb NOT NULL,
  last_fetched timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create book_audiences table for storing book audience assignments
CREATE TABLE IF NOT EXISTS public.book_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn text NOT NULL UNIQUE,
  audience text NOT NULL CHECK (audience IN ('A', 'C', 'T')), -- Adult, Children, Teen
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create bestseller_switches table for tracking list inclusions
CREATE TABLE IF NOT EXISTS public.bestseller_switches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_isbn text NOT NULL,
  switch_type text NOT NULL CHECK (switch_type IN ('include', 'exclude')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (book_isbn, switch_type)
);

-- Add helpful indexes
CREATE INDEX IF NOT EXISTS idx_fetch_cache_key ON public.fetch_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_fetch_cache_last_fetched ON public.fetch_cache(last_fetched);
CREATE INDEX IF NOT EXISTS idx_book_audiences_isbn ON public.book_audiences(isbn);
CREATE INDEX IF NOT EXISTS idx_bestseller_switches_isbn ON public.bestseller_switches(book_isbn);

-- Enable RLS on all tables
ALTER TABLE public.fetch_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bestseller_switches ENABLE ROW LEVEL SECURITY;

-- Public read access for fetch_cache (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fetch_cache' AND policyname = 'Public can view cache data'
  ) THEN
    CREATE POLICY "Public can view cache data"
    ON public.fetch_cache
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- PBN staff can insert/update fetch_cache (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'fetch_cache' AND policyname = 'PBN staff can manage cache'
  ) THEN
    CREATE POLICY "PBN staff can manage cache"
    ON public.fetch_cache
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'pbn_staff'))
    WITH CHECK (public.has_role(auth.uid(), 'pbn_staff'));
  END IF;
END $$;

-- Public read access for book_audiences (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'book_audiences' AND policyname = 'Public can view book audiences'
  ) THEN
    CREATE POLICY "Public can view book audiences"
    ON public.book_audiences
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- PBN staff can manage book_audiences (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'book_audiences' AND policyname = 'PBN staff can manage book audiences'
  ) THEN
    CREATE POLICY "PBN staff can manage book audiences"
    ON public.book_audiences
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'pbn_staff'))
    WITH CHECK (public.has_role(auth.uid(), 'pbn_staff'));
  END IF;
END $$;

-- Public read access for bestseller_switches (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'bestseller_switches' AND policyname = 'Public can view bestseller switches'
  ) THEN
    CREATE POLICY "Public can view bestseller switches"
    ON public.bestseller_switches
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- PBN staff can manage bestseller_switches (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'bestseller_switches' AND policyname = 'PBN staff can manage bestseller switches'
  ) THEN
    CREATE POLICY "PBN staff can manage bestseller switches"
    ON public.bestseller_switches
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'pbn_staff'))
    WITH CHECK (public.has_role(auth.uid(), 'pbn_staff'));
  END IF;
END $$;

-- Add trigger for updating updated_at timestamp on book_audiences
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_book_audiences_updated_at'
  ) THEN
    CREATE TRIGGER update_book_audiences_updated_at
    BEFORE UPDATE ON public.book_audiences
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;