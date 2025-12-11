-- Create table to store weekly bestseller positions if it doesn't exist
CREATE TABLE IF NOT EXISTS public.book_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn text NOT NULL,
  title text,
  author text,
  publisher text,
  category text NOT NULL,
  rank integer NOT NULL,
  price text,
  week_date date NOT NULL,
  list_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (isbn, week_date, category)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_book_positions_week_date ON public.book_positions(week_date);
CREATE INDEX IF NOT EXISTS idx_book_positions_list_title ON public.book_positions(list_title);
CREATE INDEX IF NOT EXISTS idx_book_positions_category ON public.book_positions(category);
CREATE INDEX IF NOT EXISTS idx_book_positions_isbn ON public.book_positions(isbn);

-- Enable RLS
ALTER TABLE public.book_positions ENABLE ROW LEVEL SECURITY;

-- Public read access (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'book_positions' AND policyname = 'Public can view book positions'
  ) THEN
    CREATE POLICY "Public can view book positions"
    ON public.book_positions
    FOR SELECT
    USING (true);
  END IF;
END $$;

-- Only PBN staff can insert (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'book_positions' AND policyname = 'PBN staff can insert book positions'
  ) THEN
    CREATE POLICY "PBN staff can insert book positions"
    ON public.book_positions
    FOR INSERT
    TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'pbn_staff'));
  END IF;
END $$;
