import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { RegionalPerformance } from '@/types/performance';

/**
 * Fetch regional performance breakdown for a book
 */
async function fetchRegionalPerformance(
  isbn: string,
  year: number
): Promise<RegionalPerformance[]> {
  const { data, error } = await supabase
    .from('book_regional_performance')
    .select('*')
    .eq('isbn', isbn)
    .eq('year', year)
    .order('regional_score', { ascending: false });

  if (error) {
    logger.error('useBookRegionalPerformance', 'Failed to fetch regional performance', error);
    throw error;
  }

  // Supabase returns numeric columns as strings, parse them to numbers
  return (data || []).map(region => ({
    ...region,
    regional_score: Number(region.regional_score),
    regional_strength_index: Number(region.regional_strength_index),
    weeks_on_chart: Number(region.weeks_on_chart),
    best_rank: Number(region.best_rank),
    avg_rank: Number(region.avg_rank),
    avg_score_per_week: Number(region.avg_score_per_week),
  })) as RegionalPerformance[];
}

/**
 * React Query hook for fetching book regional performance
 *
 * @param isbn - Book ISBN
 * @param year - Year for metrics (defaults to 2025)
 * @returns Query result with regional performance array
 */
export function useBookRegionalPerformance(isbn: string, year: number = 2025) {
  return useQuery({
    queryKey: ['bookRegionalPerformance', isbn, year],
    queryFn: () => fetchRegionalPerformance(isbn, year),
    staleTime: 1000 * 60 * 60, // 1 hour
    retry: 3,
  });
}
