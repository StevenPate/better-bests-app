/**
 * useAudiencesByIsbn - Hook for fetching audience classifications by ISBN array
 *
 * Simplified version of useBookAudiences that works with raw ISBN arrays
 * instead of BestsellerList data structures. Used for Year in Review filtering.
 */

import { useQuery } from '@tanstack/react-query';
import { BestsellerParser } from '@/utils/bestsellerParser';
import { logger } from '@/lib/logger';

export type AudienceType = 'A' | 'T' | 'C'; // Adult, Teen, Children

export interface UseAudiencesByIsbnReturn {
  /** Map of ISBN to audience (A/T/C) */
  audiences: Map<string, AudienceType>;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
}

/**
 * Hook for fetching audience classifications for a list of ISBNs
 *
 * @param isbns - Array of ISBNs to look up
 * @returns Audience map, loading state, and error state
 */
export function useAudiencesByIsbn(isbns: string[]): UseAudiencesByIsbnReturn {
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['audiences-by-isbn', isbns.sort().join(',')],
    queryFn: async () => {
      if (isbns.length === 0) {
        return new Map<string, AudienceType>();
      }

      logger.debug('[useAudiencesByIsbn] Fetching audiences for', isbns.length, 'ISBNs');

      try {
        const audienceRecord = await BestsellerParser.batchGetBookAudiences(isbns);
        const audienceMap = new Map<string, AudienceType>();

        for (const [isbn, audience] of Object.entries(audienceRecord)) {
          if (audience === 'A' || audience === 'T' || audience === 'C') {
            audienceMap.set(isbn, audience);
          }
        }

        logger.debug('[useAudiencesByIsbn] Found audiences for', audienceMap.size, 'of', isbns.length, 'ISBNs');
        return audienceMap;
      } catch (err) {
        logger.error('[useAudiencesByIsbn] Error fetching audiences:', err);
        throw err;
      }
    },
    enabled: isbns.length > 0,
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000,    // 1 hour
  });

  return {
    audiences: data || new Map<string, AudienceType>(),
    isLoading,
    error: error as Error | null,
  };
}
