/**
 * useBestsellerData - Custom hook for fetching and managing bestseller list data
 *
 * Centralizes all data fetching logic for bestseller lists, including:
 * - Reads ingested data from regional_bestsellers (never fetches from ABA)
 * - Comparison week management
 * - Refresh functionality
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { fetchBestsellerListFromDb } from '@/services/bestsellerApi';
import { BestsellerList } from '@/types/bestseller';
import { logger } from '@/lib/logger';
import { FetchError, ErrorCode } from '@/lib/errors';
import { useRegion } from './useRegion';

export interface UseBestsellerDataOptions {
  /** Optional custom comparison week (YYYY-MM-DD format) */
  comparisonWeek?: string;
}

export interface UseBestsellerDataReturn {
  /** Current bestseller list data */
  data: BestsellerList | null;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Current comparison week */
  comparisonWeek: string;
  /** Update comparison week and refetch */
  setComparisonWeek: (week: string) => void;
  /** Force refresh data */
  refresh: () => Promise<void>;
  /** Clear local switching data (POS/shelf checkboxes) */
  clearSwitchingData: () => void;
}

/**
 * Hook for managing bestseller list data with React Query
 */
export function useBestsellerData(options: UseBestsellerDataOptions = {}): UseBestsellerDataReturn {
  const queryClient = useQueryClient();
  const { currentRegion } = useRegion();
  const [comparisonWeek, setComparisonWeekState] = useState<string>(options.comparisonWeek || '');

  // Query for bestseller data
  const {
    data: queryData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['bestseller-data', currentRegion.abbreviation, comparisonWeek],
    queryFn: async () => {
      logger.debug('[useBestsellerData] Fetching bestseller data for region:', currentRegion.abbreviation, 'comparison:', comparisonWeek || 'default');

      // ABA v2 era: the browser reads only what Trigger.dev ingested into
      // regional_bestsellers — no live fetching from ABA.
      const result = await fetchBestsellerListFromDb({
        region: currentRegion.abbreviation,
        comparisonWeek: comparisonWeek || undefined,
      });

      if (!result.current) {
        throw new FetchError(
          ErrorCode.DATA_FETCH_FAILED,
          { resource: 'bestseller_data', region: currentRegion.abbreviation, comparisonWeek },
          'No bestseller data stored for region'
        );
      }

      return result.current;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes - data updates weekly
    gcTime: 60 * 60 * 1000,     // 1 hour - keep in cache longer
    retry: 2,                    // Retry failed requests twice
  });

  // Auto-set comparison week to previous week if not set by caller
  useEffect(() => {
    if (!comparisonWeek && queryData?.date) {
      const previousWeek = new Date(queryData.date);
      previousWeek.setDate(previousWeek.getDate() - 7);
      const previousWeekStr = previousWeek.toISOString().split('T')[0];
      setComparisonWeekState(previousWeekStr);
    }
  }, [comparisonWeek, queryData?.date]);


  /**
   * Update comparison week and trigger refetch
   */
  const setComparisonWeek = (week: string) => {
    logger.debug('[useBestsellerData] Setting comparison week:', week);
    setComparisonWeekState(week);
  };

  /**
   * Force refresh data from source
   */
  const refresh = async () => {
    logger.debug('[useBestsellerData] Force refreshing data');

    // Invalidate all matching queries for this region
    await queryClient.invalidateQueries({
      queryKey: ['bestseller-data', currentRegion.abbreviation]
    });

    // Refetch current query
    await refetch();
  };

  /**
   * Clear local switching data from localStorage
   */
  const clearSwitchingData = () => {
    logger.debug('[useBestsellerData] Clearing switching data from localStorage');
    localStorage.removeItem('bestseller-pos-data');
    localStorage.removeItem('bestseller-shelf-data');
  };

  return {
    data: queryData || null,
    isLoading,
    error: error as Error | null,
    comparisonWeek,
    setComparisonWeek,
    refresh,
    clearSwitchingData,
  };
}
