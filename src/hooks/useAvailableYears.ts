import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/** Fetch distinct years that have weekly scores data */
async function fetchAvailableYears(): Promise<number[]> {
  // Get the earliest and latest week_date to determine the year range.
  // Only 2 rows are fetched regardless of table size.
  const [firstResult, lastResult] = await Promise.all([
    supabase
      .from('weekly_scores')
      .select('week_date')
      .order('week_date', { ascending: true })
      .limit(1),
    supabase
      .from('weekly_scores')
      .select('week_date')
      .order('week_date', { ascending: false })
      .limit(1),
  ]);

  if (firstResult.error) {
    logger.error('useAvailableYears', 'Failed to fetch earliest week', firstResult.error);
    throw firstResult.error;
  }
  if (lastResult.error) {
    logger.error('useAvailableYears', 'Failed to fetch latest week', lastResult.error);
    throw lastResult.error;
  }

  if (!firstResult.data?.length || !lastResult.data?.length) return [];

  // Parse years from date strings (YYYY-MM-DD) to avoid timezone issues
  const firstYear = parseInt(firstResult.data[0].week_date.substring(0, 4));
  const lastYear = parseInt(lastResult.data[0].week_date.substring(0, 4));

  const years: number[] = [];
  for (let y = firstYear; y <= lastYear; y++) years.push(y);
  return years;
}

/**
 * React Query hook for fetching available metric years
 *
 * @returns Query result with sorted array of years that have performance data
 */
export function useAvailableYears() {
  return useQuery({
    queryKey: ['availableYears'],
    queryFn: fetchAvailableYears,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
