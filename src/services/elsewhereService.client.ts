/**
 * Elsewhere Service (Client Fallback)
 *
 * Temporary client-side implementation that mirrors the logic of the
 * `fetch-elsewhere-books` edge function. This is used while we wait for
 * Supabase to resolve the OPTIONS preflight BOOT_ERROR blocking direct
 * edge function calls from the browser.
 *
 * Identifies books that are bestselling in comparison regions but have
 * NOT ONCE appeared on the target region's lists in the past year.
 * Results are sorted by newest (most recent first appearance) by default.
 *
 * IMPORTANT: Switch back to the edge function version in
 * `elsewhereService.ts` once the CORS issue is fixed to avoid pulling
 * large datasets into the browser.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import {
  AggregateMetrics,
  ElsewhereBook,
  ElsewhereDataResponse,
  ElsewhereFilters,
  RegionalPerformance,
} from '@/types/elsewhere';

const PAGE_SIZE = 1000; // Supabase range chunk size used by the edge function
const LOOKBACK_DAYS = 28; // For comparison region books (past 4 weeks)
const TARGET_LOOKBACK_DAYS = 365; // For target region check (past year)

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

type Trend = RegionalPerformance['trend'];

function calculateTrend(
  currentRank: number | null,
  bestRank: number,
  weeksOnList: number
): Trend {
  if (weeksOnList <= 2) return 'new';
  if (!currentRank) return 'falling';

  if (currentRank - bestRank <= 2) return 'rising';
  if (currentRank - bestRank > 5) return 'falling';
  return 'stable';
}

/**
 * Fetch all ISBNs that appeared on the target region in the past year
 * (365 days lookback) to exclude from elsewhere results.
 */
async function fetchTargetRegionIsbns(targetRegion: string): Promise<Set<string>> {
  const targetIsbns = new Set<string>();
  let page = 0;
  let hasMore = true;

  // Calculate cutoff date for past year
  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - TARGET_LOOKBACK_DAYS);
  const cutoffDate = oneYearAgo.toISOString().split('T')[0];

  while (hasMore) {
    const { data, error } = await supabase
      .from('regional_bestsellers')
      .select('isbn')
      .eq('region', targetRegion)
      .gte('week_date', cutoffDate)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) {
      logger.error('elsewhereService.client', 'Error fetching target region ISBNs:', error);
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      data.forEach((row) => {
        if (row?.isbn) targetIsbns.add(row.isbn);
      });
      hasMore = data.length === PAGE_SIZE;
      page += 1;
    }
  }

  return targetIsbns;
}

async function fetchRegionalBooks(
  targetRegion: string,
  filters: ElsewhereFilters
): Promise<RegionalBestsellerRow[]> {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - LOOKBACK_DAYS);
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split('T')[0];

  let page = 0;
  let hasMore = true;
  const allBooks: RegionalBestsellerRow[] = [];

  while (hasMore) {
    let query = supabase
      .from('regional_bestsellers')
      .select('*')
      .gte('week_date', fourWeeksAgoStr)
      .neq('region', targetRegion)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order('week_date', { ascending: false });

    if (filters.comparisonRegions.length > 0) {
      query = query.in('region', filters.comparisonRegions);
    }

    if (filters.audiences && filters.audiences.length > 0) {
      query = query.in('audience', filters.audiences);
    }

    if (filters.categories && filters.categories.length > 0) {
      query = query.in('category', filters.categories);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('elsewhereService.client', 'Error fetching regional books:', error);
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allBooks.push(...(data as RegionalBestsellerRow[]));
      hasMore = data.length === PAGE_SIZE;
      page += 1;
    }
  }

  return allBooks;
}

function groupElsewhereBooks(
  regionalBooks: RegionalBestsellerRow[],
  targetIsbns: Set<string>
): ElsewhereBook[] {
  const bookMap = new Map<string, {
    isbn: string;
    title: string;
    author: string;
    publisher?: string;
    category?: string;
    regionalPerf: Map<string, {
      ranks: number[];
      weeks: number;
      category?: string;
      firstSeen?: string;
      lastSeen?: string;
    }>;
  }>();

  for (const book of regionalBooks) {
    if (!book.isbn || targetIsbns.has(book.isbn)) continue;

    if (!bookMap.has(book.isbn)) {
      bookMap.set(book.isbn, {
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        category: book.category,
        regionalPerf: new Map(),
      });
    }

    const bookData = bookMap.get(book.isbn)!;

    if (!bookData.regionalPerf.has(book.region)) {
      bookData.regionalPerf.set(book.region, {
        ranks: [],
        weeks: 0,
        category: book.category,
        firstSeen: book.week_date,
        lastSeen: book.week_date,
      });
    }

    const regionData = bookData.regionalPerf.get(book.region)!;
    regionData.ranks.push(book.rank);
    regionData.weeks += 1;

    if (!regionData.firstSeen || book.week_date < regionData.firstSeen) {
      regionData.firstSeen = book.week_date;
    }

    if (!regionData.lastSeen || book.week_date > regionData.lastSeen) {
      regionData.lastSeen = book.week_date;
    }
  }

  const elsewhereBooks: ElsewhereBook[] = [];

  for (const [isbn, bookData] of bookMap.entries()) {
    const regionalPerformance: RegionalPerformance[] = [];
    let totalWeeks = 0;
    let bestRankOverall = Infinity;
    let firstSeenDate: string | undefined;
    let lastSeenDate: string | undefined;

    for (const [region, perfData] of bookData.regionalPerf.entries()) {
      const bestRank = Math.min(...perfData.ranks);
      const currentRank = perfData.ranks[0] ?? null;
      const trend = calculateTrend(currentRank, bestRank, perfData.weeks);

      regionalPerformance.push({
        region,
        currentRank,
        weeksOnList: perfData.weeks,
        bestRank,
        trend,
        category: perfData.category,
      });

      totalWeeks += perfData.weeks;
      bestRankOverall = Math.min(bestRankOverall, bestRank);

      if (!firstSeenDate || (perfData.firstSeen && perfData.firstSeen < firstSeenDate)) {
        firstSeenDate = perfData.firstSeen;
      }

      if (!lastSeenDate || (perfData.lastSeen && perfData.lastSeen > lastSeenDate)) {
        lastSeenDate = perfData.lastSeen;
      }
    }

    const aggregateMetrics: AggregateMetrics = {
      totalRegions: regionalPerformance.length,
      totalWeeksAcrossAllRegions: totalWeeks,
      bestRankAchieved: bestRankOverall === Infinity ? 0 : bestRankOverall,
      averageRank:
        regionalPerformance.length > 0
          ? Math.round(
              (regionalPerformance.reduce((sum, perf) => sum + perf.bestRank, 0) /
                regionalPerformance.length) *
                10
            ) / 10
          : 0,
    };

    elsewhereBooks.push({
      isbn,
      title: bookData.title,
      author: bookData.author,
      publisher: bookData.publisher,
      category: bookData.category,
      regionalPerformance,
      aggregateMetrics,
      firstSeenDate,
      lastSeenDate,
    });
  }

  return elsewhereBooks;
}

function applyFiltersAndSorting(
  books: ElsewhereBook[],
  filters: ElsewhereFilters
): ElsewhereBook[] {
  let filtered = [...books];

  if (filters.minWeeksOnList) {
    filtered = filtered.filter(
      (book) => book.aggregateMetrics.totalWeeksAcrossAllRegions >= filters.minWeeksOnList!
    );
  }

  if (filters.minRegions) {
    filtered = filtered.filter(
      (book) => book.aggregateMetrics.totalRegions >= filters.minRegions!
    );
  }

  // Filter for new this week
  if (filters.showOnlyNewThisWeek) {
    // Get the most recent week_date from the data
    const mostRecentWeek = filtered.reduce((latest, book) => {
      return book.lastSeenDate && book.lastSeenDate > latest ? book.lastSeenDate : latest;
    }, '');

    filtered = filtered.filter(
      (book) => book.firstSeenDate === mostRecentWeek
    );
  }

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      (book) =>
        book.title.toLowerCase().includes(searchLower) ||
        book.author.toLowerCase().includes(searchLower) ||
        book.isbn.includes(searchLower)
    );
  }

  switch (filters.sortBy) {
    case 'most_regions':
      filtered.sort(
        (a, b) => b.aggregateMetrics.totalRegions - a.aggregateMetrics.totalRegions
      );
      break;
    case 'best_rank':
      filtered.sort(
        (a, b) => a.aggregateMetrics.bestRankAchieved - b.aggregateMetrics.bestRankAchieved
      );
      break;
    case 'total_weeks':
      filtered.sort(
        (a, b) =>
          b.aggregateMetrics.totalWeeksAcrossAllRegions -
          a.aggregateMetrics.totalWeeksAcrossAllRegions
      );
      break;
    case 'newest':
      filtered.sort((a, b) => {
        // Sort by first appearance date (most recent first)
        if (!a.firstSeenDate) return 1;
        if (!b.firstSeenDate) return -1;
        return b.firstSeenDate.localeCompare(a.firstSeenDate);
      });
      break;
    default:
      break;
  }

  return filtered;
}

export async function fetchElsewhereBooks(
  filters: ElsewhereFilters
): Promise<ElsewhereDataResponse> {
  const startTime = Date.now();
  const normalizedFilters: ElsewhereFilters = {
    ...filters,
    sortBy: filters.sortBy || 'newest',
    comparisonRegions: filters.comparisonRegions || [],
  };

  logger.debug('elsewhereService.client', 'Fetching Elsewhere data with filters:', {
    targetRegion: normalizedFilters.targetRegion,
    comparisonRegions: normalizedFilters.comparisonRegions,
    sortBy: normalizedFilters.sortBy,
  });

  const targetIsbns = await fetchTargetRegionIsbns(normalizedFilters.targetRegion);
  const allRegionalBooks = await fetchRegionalBooks(
    normalizedFilters.targetRegion,
    normalizedFilters
  );

  const groupedBooks = groupElsewhereBooks(allRegionalBooks, targetIsbns);
  const filteredBooks = applyFiltersAndSorting(groupedBooks, normalizedFilters);

  const page = normalizedFilters.page || 1;
  const pageSize = normalizedFilters.pageSize || 20;
  const totalPages = Math.max(1, Math.ceil(filteredBooks.length / pageSize));
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedBooks = filteredBooks.slice(startIndex, endIndex);

  const elapsed = Date.now() - startTime;
  logger.debug(
    'elsewhereService.client',
    `Returning ${paginatedBooks.length} of ${filteredBooks.length} elsewhere books (page ${page}/${totalPages}) in ${elapsed}ms`
  );

  return {
    books: paginatedBooks,
    totalCount: filteredBooks.length,
    availableRegions: normalizedFilters.comparisonRegions,
    weekDate: new Date().toISOString().split('T')[0],
    lastUpdated: new Date().toISOString(),
    page,
    pageSize,
    totalPages,
  };
}

