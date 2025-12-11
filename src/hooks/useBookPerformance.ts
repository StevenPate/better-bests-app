import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { BookPerformanceMetrics } from '@/types/performance';

/**
 * Fetch book performance metrics for a given ISBN and year
 */
async function fetchBookPerformance(
  isbn: string,
  year: number
): Promise<BookPerformanceMetrics | null> {
  const { data, error } = await supabase
    .from('book_performance_metrics')
    .select('*')
    .eq('isbn', isbn)
    .eq('year', year)
    .single();

  if (error) {
    // Not found is expected for books without performance data
    if (error.code === 'PGRST116') {
      logger.debug('useBookPerformance', `No performance data for ${isbn} in ${year}`);
      return null;
    }
    throw error;
  }

  // Supabase returns numeric columns as strings, parse them to numbers
  return {
    ...data,
    total_score: Number(data.total_score),
    weeks_on_chart: Number(data.weeks_on_chart),
    regions_appeared: Number(data.regions_appeared),
    max_weekly_score: Number(data.max_weekly_score),
    avg_weekly_score: Number(data.avg_weekly_score),
    avg_score_per_week: Number(data.avg_score_per_week),
    rsi_variance: Number(data.rsi_variance),
  } as BookPerformanceMetrics;
}

/**
 * React Query hook for fetching book performance metrics
 *
 * @param isbn - Book ISBN
 * @param year - Year for metrics (defaults to 2025)
 * @returns Query result with performance metrics
 */
export function useBookPerformance(isbn: string, year: number = 2025) {
  return useQuery({
    queryKey: ['bookPerformance', isbn, year],
    queryFn: () => fetchBookPerformance(isbn, year),
    staleTime: 1000 * 60 * 60, // 1 hour (metrics update nightly)
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
