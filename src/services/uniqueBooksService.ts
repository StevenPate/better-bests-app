/**
 * Unique Books Service
 *
 * Fetches books that have appeared ONLY on a specific region's bestseller lists
 * in the past year, with no appearances on any other region's lists
 * during that same year.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const PAGE_SIZE = 1000; // Supabase range chunk size
const LOOKBACK_DAYS = 365; // One year

export interface UniqueBook {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  category?: string;
  audience?: string;
  weeksOnList: number;
  firstSeen: string;
  lastSeen: string;
  bestRank: number;
  currentRank: number | null;
}

export interface UniqueBooksResponse {
  books: UniqueBook[];
  totalCount: number;
  region: string;
  lastUpdated: string;
}

interface RegionalBestsellerRow {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  category?: string;
  audience?: string;
  region: string;
  rank: number;
  week_date: string;
}

/**
 * Fetch all ISBNs that appeared on the target region in the last year
 */
async function fetchRecentRegionIsbns(region: string): Promise<Map<string, RegionalBestsellerRow[]>> {
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - LOOKBACK_DAYS);
  const cutoffDate = oneYearAgo.toISOString().split('T')[0];

  const isbnMap = new Map<string, RegionalBestsellerRow[]>();
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('regional_bestsellers')
      .select('*')
      .eq('region', region)
      .gte('week_date', cutoffDate)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      logger.error('uniqueBooksService', 'Error fetching recent region ISBNs:', error);
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      (data as RegionalBestsellerRow[]).forEach((row) => {
        if (!isbnMap.has(row.isbn)) {
          isbnMap.set(row.isbn, []);
        }
        isbnMap.get(row.isbn)!.push(row);
      });
      hasMore = data.length === PAGE_SIZE;
      page += 1;
    }
  }

  logger.debug('uniqueBooksService', `Found ${isbnMap.size} unique ISBNs in ${region} from last year`);
  return isbnMap;
}

/**
 * For each ISBN, check if it has appeared in any other region in the past year
 */
async function buildPastYearRegionMap(isbns: string[], cutoffDate: string): Promise<Map<string, Set<string>>> {
  const isbnRegionMap = new Map<string, Set<string>>();
  let page = 0;
  let hasMore = true;

  // Batch ISBNs to avoid hitting URL length limits
  const batchSize = 100;
  for (let i = 0; i < isbns.length; i += batchSize) {
    const isbnBatch = isbns.slice(i, i + batchSize);
    page = 0;
    hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('regional_bestsellers')
        .select('isbn, region')
        .in('isbn', isbnBatch)
        .gte('week_date', cutoffDate)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) {
        logger.error('uniqueBooksService', 'Error fetching past year region data:', error);
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        data.forEach((row) => {
          if (!isbnRegionMap.has(row.isbn)) {
            isbnRegionMap.set(row.isbn, new Set());
          }
          isbnRegionMap.get(row.isbn)!.add(row.region);
        });
        hasMore = data.length === PAGE_SIZE;
        page += 1;
      }
    }
  }

  return isbnRegionMap;
}

/**
 * Calculate book metrics from appearance data
 */
function calculateBookMetrics(appearances: RegionalBestsellerRow[]): {
  weeksOnList: number;
  firstSeen: string;
  lastSeen: string;
  bestRank: number;
  currentRank: number | null;
} {
  const sortedByDate = [...appearances].sort((a, b) =>
    a.week_date.localeCompare(b.week_date)
  );

  const firstSeen = sortedByDate[0].week_date;
  const lastSeen = sortedByDate[sortedByDate.length - 1].week_date;
  const weeksOnList = appearances.length;
  const bestRank = Math.min(...appearances.map(a => a.rank));

  // Current rank is the most recent appearance
  const mostRecent = sortedByDate[sortedByDate.length - 1];
  const currentRank = mostRecent ? mostRecent.rank : null;

  return { weeksOnList, firstSeen, lastSeen, bestRank, currentRank };
}

/**
 * Fetch books unique to the specified region
 */
export async function fetchUniqueBooks(region: string): Promise<UniqueBooksResponse> {
  const startTime = Date.now();
  logger.debug('uniqueBooksService', `Fetching unique books for ${region}`);

  // Calculate cutoff date for past year
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - LOOKBACK_DAYS);
  const cutoffDate = oneYearAgo.toISOString().split('T')[0];

  // Step 1: Get all ISBNs that appeared on this region in the last year
  const recentBooks = await fetchRecentRegionIsbns(region);
  const isbns = Array.from(recentBooks.keys());

  if (isbns.length === 0) {
    logger.debug('uniqueBooksService', 'No books found in region for the past year');
    return {
      books: [],
      totalCount: 0,
      region,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Step 2: For each ISBN, check if it appeared in other regions in the past year
  const isbnRegionMap = await buildPastYearRegionMap(isbns, cutoffDate);

  // Step 3: Filter to ISBNs that have ONLY appeared in the target region (past year)
  const uniqueIsbns = isbns.filter(isbn => {
    const regions = isbnRegionMap.get(isbn);
    return regions && regions.size === 1 && regions.has(region);
  });

  logger.debug('uniqueBooksService', `Found ${uniqueIsbns.length} unique ISBNs out of ${isbns.length} total`);

  // Step 4: Build book objects with metrics
  const uniqueBooks: UniqueBook[] = uniqueIsbns.map(isbn => {
    const appearances = recentBooks.get(isbn)!;
    const firstAppearance = appearances[0];
    const metrics = calculateBookMetrics(appearances);

    return {
      isbn,
      title: firstAppearance.title,
      author: firstAppearance.author,
      publisher: firstAppearance.publisher,
      category: firstAppearance.category,
      audience: firstAppearance.audience,
      ...metrics,
    };
  });

  // Step 5: Sort by first seen date (most recent first)
  uniqueBooks.sort((a, b) => b.firstSeen.localeCompare(a.firstSeen));

  const elapsed = Date.now() - startTime;
  logger.debug('uniqueBooksService', `Found ${uniqueBooks.length} unique books in ${elapsed}ms`);

  return {
    books: uniqueBooks,
    totalCount: uniqueBooks.length,
    region,
    lastUpdated: new Date().toISOString(),
  };
}
