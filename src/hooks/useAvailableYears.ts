import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/** Fetch distinct years that have weekly scores data */
async function fetchAvailableYears(): Promise<number[]> {
  // Query weekly_scores (not book_performance_metrics) because weekly data
  // exists immediately, while metrics are only populated by the nightly cron.
  // We query one row per region per week (limit covers all possible combos)
  // then extract distinct years client-side.
  const { data, error } = await supabase
    .from('weekly_scores')
    .select('week_date')
    .order('week_date', { ascending: true })
    .limit(10000);

  if (error) {
    logger.error('useAvailableYears', 'Failed to fetch available years', error);
    throw error;
  }

  const years = [...new Set(
    data.map((row: { week_date: string }) => new Date(row.week_date).getFullYear())
  )].sort((a, b) => a - b);
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
