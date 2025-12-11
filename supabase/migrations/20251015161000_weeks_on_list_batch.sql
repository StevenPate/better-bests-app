-- Optimize weeks-on-list lookups by adding an aggregate RPC
CREATE INDEX IF NOT EXISTS book_positions_isbn_idx ON public.book_positions (isbn);

CREATE OR REPLACE FUNCTION public.get_weeks_on_list_batch(isbn_list text[])
RETURNS TABLE (isbn text, weeks_on_list integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bp.isbn,
         COUNT(*)::integer AS weeks_on_list
  FROM public.book_positions bp
  WHERE isbn_list IS NOT NULL
    AND bp.isbn IS NOT NULL
    AND bp.isbn = ANY(isbn_list)
  GROUP BY bp.isbn;
$$;

GRANT EXECUTE ON FUNCTION public.get_weeks_on_list_batch(text[]) TO anon, authenticated;
