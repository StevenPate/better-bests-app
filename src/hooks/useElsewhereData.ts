/**
 * useElsewhereData Hook
 *
 * Fetches and manages Elsewhere discovery data with React Query caching.
 * Queries the regional_bestsellers table to find books appearing in other
 * regions but not in the target region.
 */

import { useQuery } from '@tanstack/react-query';
import { ElsewhereFilters } from '@/types/elsewhere';
// Temporarily using client-side implementation while edge function CORS is being fixed
// TODO: Switch back to '@/services/elsewhereService' when Supabase resolves OPTIONS BOOT_ERROR
import { fetchElsewhereBooks } from '@/services/elsewhereService.client';

/**
 * Hook for Elsewhere discovery data
 */
export function useElsewhereData(filters: ElsewhereFilters) {
  const queryKey = [
    'elsewhere',
    filters.targetRegion,
    [...filters.comparisonRegions].sort().join(','),
    filters.sortBy,
    filters.audiences ? [...filters.audiences].sort().join(',') : 'all',
    filters.minWeeksOnList || 0,
    filters.minRegions || 0,
    filters.showOnlyNewThisWeek || false,
    filters.search || '',
    filters.page || 1,
    filters.pageSize || 20,
  ];

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => fetchElsewhereBooks(filters),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes (was cacheTime in v4)
    retry: 2,
  });

  return {
    books: data?.books || [],
    totalCount: data?.totalCount || 0,
    availableRegions: data?.availableRegions || [],
    weekDate: data?.weekDate || '',
    lastUpdated: data?.lastUpdated || '',
    page: data?.page || 1,
    pageSize: data?.pageSize || 20,
    totalPages: data?.totalPages || 1,
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
