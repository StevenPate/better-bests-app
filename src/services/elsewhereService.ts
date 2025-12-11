/**
 * Elsewhere Service
 *
 * Client-side service that calls the fetch-elsewhere-books edge function
 * for cross-region bestseller discovery.
 *
 * ARCHITECTURE: Edge Function Approach
 * - Heavy lifting done server-side (queries, filtering, aggregation)
 * - Client receives only filtered, sorted results
 * - Reduces bandwidth and improves performance
 * - Business logic protected on server
 *
 * Data Flow:
 * 1. Client calls fetchElsewhereBooks() with filters
 * 2. Service invokes edge function via Supabase Functions API
 * 3. Edge function queries regional_bestsellers table
 * 4. Edge function filters, aggregates, and sorts
 * 5. Edge function returns ElsewhereDataResponse
 * 6. Service returns data to React Query hook
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  ElsewhereFilters,
  ElsewhereDataResponse,
} from '@/types/elsewhere';

/**
 * Fetch elsewhere books via edge function
 *
 * @param filters - Filters including target region and comparison regions
 * @returns Promise<ElsewhereDataResponse>
 */
export async function fetchElsewhereBooks(
  filters: ElsewhereFilters
): Promise<ElsewhereDataResponse> {
  const startTime = Date.now();
  logger.debug('elsewhereService', 'Calling edge function with filters:', {
    targetRegion: filters.targetRegion,
    comparisonRegions: filters.comparisonRegions,
    sortBy: filters.sortBy,
  });

  try {
    const { data, error } = await supabase.functions.invoke('fetch-elsewhere-books', {
      body: filters,
    });

    if (error) {
      logger.error('elsewhereService', 'Edge function error:', error);
      throw new Error(error.message || 'Failed to fetch elsewhere books');
    }

    if (!data || !data.success) {
      const errorMsg = data?.error || 'Unknown error from edge function';
      logger.error('elsewhereService', 'Edge function returned error:', errorMsg);
      throw new Error(errorMsg);
    }

    const elapsed = Date.now() - startTime;
    logger.debug('elsewhereService', `Received ${data.totalCount} books from edge function in ${elapsed}ms`);

    // Return the data without the success flag
    const { success, ...response } = data;
    return response as ElsewhereDataResponse;

  } catch (error) {
    logger.error('elsewhereService', 'Error calling edge function:', error);
    throw error;
  }
}
