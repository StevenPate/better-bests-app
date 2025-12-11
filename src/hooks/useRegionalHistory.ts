// src/hooks/useRegionalHistory.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RegionalWeekData } from '@/components/BookChart/types';

interface UseRegionalHistoryOptions {
  isbn: string;
  weeks: 26 | 52 | 'all';
}

interface UseRegionalHistoryResult {
  data: Map<string, RegionalWeekData[]> | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useRegionalHistory({
  isbn,
  weeks,
}: UseRegionalHistoryOptions): UseRegionalHistoryResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['regionalHistory', isbn, weeks],
    queryFn: async () => {
      // Calculate cutoff date
      const weeksCount = weeks === 'all' ? 52 : weeks;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - (weeksCount * 7));
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      // Fetch from regional_bestsellers table
      const { data: regionalData, error: regionalError } = await supabase
        .from('regional_bestsellers')
        .select('region, week_date, rank, category, list_title')
        .eq('isbn', isbn.replace(/[-\s]/g, ''))
        .gte('week_date', cutoffDateStr)
        .order('week_date', { ascending: false });

      if (regionalError) throw regionalError;

      // Group by region
      const grouped = new Map<string, RegionalWeekData[]>();

      regionalData?.forEach((row) => {
        const weekData: RegionalWeekData = {
          region: row.region,
          weekDate: row.week_date,
          rank: row.rank,
          category: row.category,
          listTitle: row.list_title || '',
        };

        if (!grouped.has(row.region)) {
          grouped.set(row.region, []);
        }
        grouped.get(row.region)!.push(weekData);
      });

      return grouped;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes - charts rarely change
    gcTime: 60 * 60 * 1000,     // 1 hour - keep charts cached longer
  });

  return {
    data: data ?? null,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
