import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface YearStats {
  weeksOfData: number;
  totalBooks: number;
}

/** Fetch week count and book count for a given year */
async function fetchYearStats(year: number): Promise<YearStats> {
  const startDate = `${year}-01-01`;
  const endDate = `${year + 1}-01-01`;

  const [weeksResult, booksResult] = await Promise.all([
    supabase
      .from('weekly_scores')
      .select('week_date')
      .gte('week_date', startDate)
      .lt('week_date', endDate),
    supabase
      .from('book_performance_metrics')
      .select('isbn')
      .eq('year', year),
  ]);

  if (weeksResult.error) {
    logger.error('useYearStats', 'Failed to fetch weekly scores', weeksResult.error);
    throw weeksResult.error;
  }
  if (booksResult.error) {
    logger.error('useYearStats', 'Failed to fetch book metrics', booksResult.error);
    throw booksResult.error;
  }

  const uniqueWeeks = new Set(weeksResult.data.map((row: { week_date: string }) => row.week_date));
  const uniqueBooks = new Set(booksResult.data.map((row: { isbn: string }) => row.isbn));

  return {
    weeksOfData: uniqueWeeks.size,
    totalBooks: uniqueBooks.size,
  };
}

/**
 * React Query hook for fetching year statistics
 *
 * @param year - Calendar year to fetch stats for
 * @returns Query result with week count and book count
 */
export function useYearStats(year: number) {
  return useQuery({
    queryKey: ['yearStats', year],
    queryFn: () => fetchYearStats(year),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
