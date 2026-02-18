import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/** Fetch distinct years that have performance data */
async function fetchAvailableYears(): Promise<number[]> {
  const { data, error } = await supabase
    .from('book_performance_metrics')
    .select('year')
    .order('year', { ascending: true });

  if (error) {
    logger.error('useAvailableYears', 'Failed to fetch available years', error);
    throw error;
  }

  const years = [...new Set(data.map((row: { year: number }) => row.year))];
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
