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

  // Parallel: get first/last week_date (2 rows) + book count from metrics (0 rows, header only)
  const [firstWeekResult, lastWeekResult, metricsCountResult] = await Promise.all([
    supabase
      .from('weekly_scores')
      .select('week_date')
      .gte('week_date', startDate)
      .lt('week_date', endDate)
      .order('week_date', { ascending: true })
      .limit(1),
    supabase
      .from('weekly_scores')
      .select('week_date')
      .gte('week_date', startDate)
      .lt('week_date', endDate)
      .order('week_date', { ascending: false })
      .limit(1),
    // count: 'exact' with head: true returns only the count header, no row data
    supabase
      .from('book_performance_metrics')
      .select('isbn', { count: 'exact', head: true })
      .eq('year', year),
  ]);

  if (firstWeekResult.error) {
    logger.error('useYearStats', 'Failed to fetch first week', firstWeekResult.error);
    throw firstWeekResult.error;
  }
  if (lastWeekResult.error) {
    logger.error('useYearStats', 'Failed to fetch last week', lastWeekResult.error);
    throw lastWeekResult.error;
  }

  // Calculate weeks from first and last dates
  let weeksOfData = 0;
  if (firstWeekResult.data?.length && lastWeekResult.data?.length) {
    const firstMs = new Date(firstWeekResult.data[0].week_date + 'T00:00:00').getTime();
    const lastMs = new Date(lastWeekResult.data[0].week_date + 'T00:00:00').getTime();
    weeksOfData = Math.round((lastMs - firstMs) / (7 * 24 * 60 * 60 * 1000)) + 1;
  }

  // Use pre-aggregated metrics count if available (works for completed years)
  let totalBooks = metricsCountResult.count || 0;

  // Fallback for current year before cron aggregates: count unique ISBNs from weekly_scores.
  // For a partial year (e.g. 7 weeks), this is ~19K rows — well within limits.
  if (totalBooks === 0 && !metricsCountResult.error) {
    const { data, error } = await supabase
      .from('weekly_scores')
      .select('isbn')
      .gte('week_date', startDate)
      .lt('week_date', endDate)
      .limit(100000);

    if (error) {
      logger.error('useYearStats', 'Failed to fetch book count fallback', error);
      throw error;
    }

    if (data) {
      totalBooks = new Set(data.map((r: { isbn: string }) => r.isbn)).size;
    }
  }

  return { weeksOfData, totalBooks };
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
