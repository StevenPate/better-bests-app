/**
 * Bestseller API Service
 *
 * New service layer that replaces client-side scraping.
 * Fetches data from secure backend API instead of directly scraping bookweb.org.
 *
 * Migration Strategy:
 * 1. This service provides the same interface as the old BestsellerParser
 * 2. Frontend code can gradually migrate to use this instead
 * 3. Once fully migrated, old scraping code can be removed
 */

import { BestsellerList } from '@/types/bestseller';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

// ============================================================================
// Type Definitions
// ============================================================================

export interface BestsellerDataResponse {
  data: {
    current: BestsellerList;
    previous: BestsellerList;
  };
  metadata: {
    currentWeek: string;
    comparisonWeek: string;
    lastFetched: string;
    nextRefresh: string;
    cacheStatus: 'fresh' | 'stale' | 'unavailable';
    bookCount?: number;
    categoryCount?: number;
    sourceUrl?: string;
    isCurrentWeek: boolean;
  };
}

export interface FetchOptions {
  /**
   * Force refresh from server (bypass local cache)
   */
  refresh?: boolean;

  /**
   * Custom comparison week (format: YYYY-MM-DD)
   * If not provided, uses previous week
   */
  comparisonWeek?: string;
}

// ============================================================================
// BestsellerApi Class
// ============================================================================

export class BestsellerApi {
  /**
   * Fetch current bestseller list with comparison data
   *
   * This replaces the old BestsellerParser.fetchBestsellerData() method.
   * Data comes from backend job instead of client-side scraping.
   */
  static async getCurrentList(options?: FetchOptions): Promise<BestsellerDataResponse | null> {
    logger.debug('BestsellerApi', 'getCurrentList called with options:', options);

    try {
      // Build query parameters
      const params = new URLSearchParams();
      params.set('week', 'current');

      if (options?.comparisonWeek) {
        params.set('compare', options.comparisonWeek);
      }

      // Call edge function API
      const { data, error } = await supabase.functions.invoke('get-bestseller-data', {
        method: 'GET',
      });

      if (error) {
        logger.error('BestsellerApi', 'Error fetching bestseller data:', error);
        throw error;
      }

      if (!data) {
        logger.warn('BestsellerApi', 'No data returned from API');
        return null;
      }

      logger.debug('BestsellerApi', 'Successfully fetched data', {
        currentWeek: data.metadata?.currentWeek,
        cacheStatus: data.metadata?.cacheStatus,
        bookCount: data.metadata?.bookCount,
      });

      return data as BestsellerDataResponse;

    } catch (error) {
      logger.error('BestsellerApi', 'Exception in getCurrentList:', error);
      throw error;
    }
  }

  /**
   * Check if new data should be fetched
   *
   * Kept for backward compatibility, but always returns true since
   * backend job handles the scheduling now.
   */
  static async shouldFetchNewData(): Promise<boolean> {
    // Backend handles scheduling, so frontend can always fetch
    // The API will return cached data if available
    return true;
  }

  /**
   * Get metadata about the last fetch
   *
   * Useful for showing "Last updated" indicators in the UI
   */
  static async getLastFetchMetadata(): Promise<{
    lastFetched: string | null;
    cacheStatus: 'fresh' | 'stale' | 'unavailable';
  }> {
    try {
      const { data: cacheData } = await supabase
        .from('fetch_cache')
        .select('last_fetched')
        .eq('cache_key', 'current_bestseller_list')
        .single();

      if (!cacheData) {
        return { lastFetched: null, cacheStatus: 'unavailable' };
      }

      const lastFetched = cacheData.last_fetched;
      const fetchedDate = new Date(lastFetched);
      const now = new Date();
      const hoursSinceFetch = (now.getTime() - fetchedDate.getTime()) / (1000 * 60 * 60);

      let cacheStatus: 'fresh' | 'stale' | 'unavailable' = 'fresh';
      if (hoursSinceFetch >= 24) {
        cacheStatus = 'unavailable';
      } else if (hoursSinceFetch >= 4) {
        cacheStatus = 'stale';
      }

      return { lastFetched, cacheStatus };

    } catch (error) {
      logger.error('BestsellerApi', 'Error getting fetch metadata:', error);
      return { lastFetched: null, cacheStatus: 'unavailable' };
    }
  }

  /**
   * Format last updated time for display
   */
  static formatLastUpdated(lastFetched: string): string {
    const date = new Date(lastFetched);
    const now = new Date();

    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else {
      // Show formatted date/time
      return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  }

  /**
   * Get status badge info for UI
   */
  static getStatusBadge(cacheStatus: 'fresh' | 'stale' | 'unavailable'): {
    label: string;
    variant: 'default' | 'secondary' | 'destructive';
  } {
    switch (cacheStatus) {
      case 'fresh':
        return { label: 'Up to date', variant: 'default' };
      case 'stale':
        return { label: 'Updating soon', variant: 'secondary' };
      case 'unavailable':
        return { label: 'Data outdated', variant: 'destructive' };
    }
  }
}

// ============================================================================
// Backward Compatibility Exports
// ============================================================================

/**
 * Export as default for easier migration from BestsellerParser
 */
export default BestsellerApi;
