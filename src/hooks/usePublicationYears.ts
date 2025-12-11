import { useQuery } from '@tanstack/react-query';
import { fetchGoogleBooksPubDatesBatch } from '@/services/googleBooksApi';

interface PublicationInfo {
  isbn: string;
  publishedDate: string | null;
  publishedYear: number | null;
}

/**
 * Parse publication year from various date formats
 * Handles: "2024", "2024-05", "2024-05-15"
 */
function parsePublishedYear(publishedDate: string | undefined): number | null {
  if (!publishedDate) return null;
  const yearMatch = publishedDate.match(/^(\d{4})/);
  return yearMatch ? parseInt(yearMatch[1], 10) : null;
}

/**
 * Fetch publication years for multiple ISBNs using cached Google Books API
 * Uses three-tier caching: in-memory (30 min) + Supabase (30 days) + API fallback
 */
async function fetchPublicationYears(isbns: string[]): Promise<Map<string, PublicationInfo>> {
  const pubDates = await fetchGoogleBooksPubDatesBatch(isbns);

  const results: Map<string, PublicationInfo> = new Map();

  for (const isbn of isbns) {
    const publishedDate = pubDates[isbn] || null;
    const publishedYear = parsePublishedYear(publishedDate ?? undefined);
    results.set(isbn, { isbn, publishedDate, publishedYear });
  }

  return results;
}

/**
 * React Query hook to fetch publication years for a list of ISBNs
 *
 * Uses three-tier caching via googleBooksApi:
 * - Layer 1: In-memory cache (30 min TTL)
 * - Layer 2: Supabase persistent cache (30 day TTL)
 * - Layer 3: Google Books API with throttling and retry
 *
 * @param isbns - Array of ISBNs to fetch publication years for
 * @returns Map of ISBN to PublicationInfo, loading state, and error
 */
export function usePublicationYears(isbns: string[]) {
  const query = useQuery({
    queryKey: ['publicationYears', isbns.sort().join(',')],
    queryFn: () => fetchPublicationYears(isbns),
    enabled: isbns.length > 0,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours - React Query layer
    gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days - React Query garbage collection
  });

  return {
    publicationYears: query.data || new Map<string, PublicationInfo>(),
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Filter books by publication year
 *
 * @param isbns - Array of ISBNs to filter
 * @param publicationYears - Map of ISBN to publication info
 * @param allowedYears - Array of years to include (e.g., [2024, 2025])
 * @returns Array of ISBNs that were published in allowed years
 */
export function filterByPublicationYear(
  isbns: string[],
  publicationYears: Map<string, PublicationInfo>,
  allowedYears: number[]
): string[] {
  return isbns.filter((isbn) => {
    const info = publicationYears.get(isbn);
    if (!info?.publishedYear) return false; // Exclude if no pub year data
    return allowedYears.includes(info.publishedYear);
  });
}

export type { PublicationInfo };
