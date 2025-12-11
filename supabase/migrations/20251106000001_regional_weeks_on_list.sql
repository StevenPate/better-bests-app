-- Add regional weeks-on-list lookup function
-- Extends weeks-on-list tracking to support multi-region data from regional_bestsellers table

-- Create index for faster ISBN lookups in regional_bestsellers
CREATE INDEX IF NOT EXISTS regional_bestsellers_isbn_region_idx
ON public.regional_bestsellers (isbn, region);

-- Create regional weeks-on-list batch function
CREATE OR REPLACE FUNCTION public.get_weeks_on_list_batch_regional(
  isbn_list text[],
  target_region text DEFAULT 'PNBA'
)
RETURNS TABLE (isbn text, weeks_on_list integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    rb.isbn,
    COUNT(DISTINCT rb.week_date)::integer AS weeks_on_list
  FROM public.regional_bestsellers rb
  WHERE isbn_list IS NOT NULL
    AND rb.isbn IS NOT NULL
    AND rb.isbn = ANY(isbn_list)
    AND rb.region = target_region
  GROUP BY rb.isbn;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_weeks_on_list_batch_regional(text[], text) TO anon, authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_weeks_on_list_batch_regional IS
  'Counts distinct weeks each ISBN has appeared on regional bestseller lists. Supports all 8 regional associations (PNBA, CALIBAN, CALIBAS, GLIBA, MPIBA, NAIBA, NEIBA, SIBA).';
