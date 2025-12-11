/**
 * useUniqueBooks Hook
 *
 * Fetches and manages unique books data with React Query caching.
 * Finds books that appeared on a specific region's lists in the past year
 * but have NEVER appeared on any other region's list (all-time historical check).
 */

import { useQuery } from '@tanstack/react-query';
import { fetchUniqueBooks } from '@/services/uniqueBooksService';

/**
 * Hook for unique books data
 */
export function useUniqueBooks(region: string) {
  const queryKey = ['unique-books', region];

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => fetchUniqueBooks(region),
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000,    // 30 minutes
    retry: 2,
  });

  return {
    books: data?.books || [],
    totalCount: data?.totalCount || 0,
    region: data?.region || region,
    lastUpdated: data?.lastUpdated || '',
    isLoading,
    error: error as Error | null,
    refetch,
  };
}
