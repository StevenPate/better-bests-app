import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface YearStats {
  weeksOfData: number;
  totalBooks: number;
}

/** Fetch week count and book count for a given year from weekly_scores */
async function fetchYearStats(year: number): Promise<YearStats> {
  const startDate = `${year}-01-01`;
  const endDate = `${year + 1}-01-01`;

  // Query weekly_scores directly (not book_performance_metrics) because
  // weekly data exists immediately, while metrics require nightly cron.
  // Use high limit to avoid Supabase's default 1000-row cap.
  const { data, error } = await supabase
    .from('weekly_scores')
    .select('week_date, isbn')
    .gte('week_date', startDate)
    .lt('week_date', endDate)
    .limit(50000);

  if (error) {
    logger.error('useYearStats', 'Failed to fetch weekly scores', error);
    throw error;
  }

  const uniqueWeeks = new Set(data.map((row: { week_date: string }) => row.week_date));
  const uniqueBooks = new Set(data.map((row: { isbn: string }) => row.isbn));

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
