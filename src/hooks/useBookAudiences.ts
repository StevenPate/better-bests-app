/**
 * useBookAudiences - Custom hook for fetching and managing book audience classifications
 *
 * Handles batched audience lookups for ISBNs with fallback to category-based defaults.
 * Uses React Query for caching and automatic refetching.
 */

import { useQuery } from '@tanstack/react-query';
import { BestsellerParser } from '@/utils/bestsellerParser';
import { BestsellerList } from '@/types/bestseller';
import { logger } from '@/lib/logger';

const isTestEnv = import.meta.env.MODE === 'test';

export interface UseBookAudiencesReturn {
  /** Map of ISBN to audience (A/T/C) */
  audiences: Record<string, string>;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** ISBNs that are using default audiences (not in database) */
  missingAudiences: string[];
}

/**
 * Get stable identifier from bestseller data for query key
 *
 * Creates a stable, unique identifier from the complete ISBN set to prevent
 * cache collisions when the same publication date has the same categories
 * but different books (e.g., mid-week corrections). By including all ISBNs
 * in the query key, any change to the book list invalidates the cache.
 *
 * @param data - Bestseller list data
 * @returns Stable identifier string (sorted ISBNs joined by |)
 */
function getISBNsIdentifier(data: BestsellerList | null): string {
  if (!data) return '';

  // Collect all unique ISBNs
  const isbnSet = new Set<string>();
  data.categories.forEach((category) => {
    category.books.forEach((book) => {
      if (book.isbn) {
        isbnSet.add(book.isbn);
      }
    });
  });

  // Sort ISBNs for stable key regardless of order
  return Array.from(isbnSet).sort().join('|');
}

/**
 * Hook for fetching audience classifications for all books in a bestseller list
 *
 * @param bestsellerData - The bestseller list data
 * @returns Audience data, loading state, and error state
 */
export function useBookAudiences(bestsellerData: BestsellerList | null, region: string = 'PNBA'): UseBookAudiencesReturn {
  const {
    data: audienceData,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'book-audiences',
      region,
      bestsellerData?.date,
      getISBNsIdentifier(bestsellerData),
    ],
    queryFn: async () => {
      if (!bestsellerData) {
        return { audiences: {}, missingAudiences: [] };
      }

      logger.debug('[useBookAudiences] Fetching audiences for', bestsellerData.categories.length, 'categories');

      // Collect all ISBNs
      const isbnSet = new Set<string>();
      bestsellerData.categories.forEach((category) => {
        category.books.forEach((book) => {
          if (book.isbn) {
            isbnSet.add(book.isbn);
          }
        });
      });

      const isbns = Array.from(isbnSet);

      if (isbns.length === 0) {
        const logMethod = isTestEnv ? logger.debug : logger.warn;
        logMethod('[useBookAudiences] No ISBNs found in bestseller data');
        return { audiences: {}, missingAudiences: [] };
      }

      // Batch fetch audiences from database
      let batchedAudiences: Record<string, string> = {};
      try {
        batchedAudiences = await BestsellerParser.batchGetBookAudiences(isbns, region);
        logger.debug('[useBookAudiences] Fetched', Object.keys(batchedAudiences).length, 'audiences from database');
      } catch (error) {
        logger.error('[useBookAudiences] Error fetching batched audiences:', error);
      }

      // Build final audience map with category-based fallbacks
      const finalAudiences: Record<string, string> = {};
      const missingAudiences: string[] = [];

      for (const category of bestsellerData.categories) {
        for (const book of category.books) {
          if (!book.isbn) {
            continue;
          }

          // Use database audience if available, otherwise fallback to category-based default
          const audience =
            batchedAudiences[book.isbn] ?? BestsellerParser.getDefaultAudience(category.name);
          finalAudiences[book.isbn] = audience;

          // Track ISBNs using default audiences
          if (!(book.isbn in batchedAudiences)) {
            missingAudiences.push(book.isbn);
          }
        }
      }

      if (missingAudiences.length > 0) {
        const logMethod = isTestEnv ? logger.debug : logger.warn;
        logMethod(
          '[useBookAudiences] Using default audiences for',
          missingAudiences.length,
          'ISBNs without database assignments'
        );
      }

      return { audiences: finalAudiences, missingAudiences };
    },
    enabled: !!bestsellerData, // Only run query when data is available
    staleTime: 30 * 60 * 1000, // 30 minutes - audiences rarely change
    gcTime: 60 * 60 * 1000,     // 1 hour - keep in cache longer
  });

  return {
    audiences: audienceData?.audiences || {},
    isLoading,
    error: error as Error | null,
    missingAudiences: audienceData?.missingAudiences || [],
  };
}
