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

import { BestsellerList, BestsellerBook } from '@/types/bestseller';
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

// ============================================================================
// DB-backed list assembly (ABA v2 era)
// ============================================================================
//
// Since the 2026 ABA source migration, the browser never fetches from ABA:
// Trigger.dev ingests the Google Sheets into regional_bestsellers and this
// function assembles the UI's BestsellerList straight from those rows.

interface DbListRow {
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  price: string | null;
  rank: number;
  category: string | null;
  last_week_rank: number | null;
  weeks_on_list: number | null;
}

/** Display order for category sections; unknown categories sort last, alphabetically. */
const CATEGORY_DISPLAY_ORDER = [
  'HARDCOVER FICTION',
  'HARDCOVER NONFICTION',
  'TRADE PAPERBACK FICTION',
  'TRADE PAPERBACK NONFICTION',
  'MASS MARKET',
  "CHILDREN'S ILLUSTRATED",
  "CHILDREN'S TITLES",
  "CHILDREN'S SERIES TITLES",
  'EARLY & MIDDLE GRADE READERS',
  'YOUNG ADULT',
  "CHILDREN'S INTEREST",
];

function displayOrder(category: string): number {
  const i = CATEGORY_DISPLAY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_DISPLAY_ORDER.length : i;
}

function isoMinusDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

async function fetchWeekRows(region: string, weekDate: string): Promise<DbListRow[]> {
  const { data, error } = await supabase
    .from('regional_bestsellers')
    .select('isbn, title, author, publisher, price, rank, category, last_week_rank, weeks_on_list')
    .eq('region', region)
    .eq('week_date', weekDate)
    .order('rank', { ascending: true });
  if (error) throw new Error(`bestseller rows query failed: ${error.message}`);
  return (data ?? []) as DbListRow[];
}

export interface DbListResult {
  current: BestsellerList;
  weekDate: string;
  comparisonWeek: string;
}

/**
 * Assemble a BestsellerList from regional_bestsellers.
 *
 * Rank-change semantics:
 * - Default comparison (exactly one week back): `previousRank` comes from the
 *   stored `last_week_rank` column — ABA is authoritative.
 * - Custom comparison week: `previousRank` is diffed against that week's
 *   stored rows by ISBN within category.
 * - `wasDropped` entries (on the comparison list, absent now) always come
 *   from the fetched comparison rows.
 * - `weeksOnList` is always the stored ABA count; null stays undefined.
 */
export async function fetchBestsellerListFromDb(options: {
  region: string;
  weekDate?: string;
  comparisonWeek?: string;
}): Promise<DbListResult> {
  const { region } = options;

  // Resolve the latest week with a limit-1 query — regional_bestsellers is
  // far past PostgREST's 1000-row default limit, so never scan it.
  let weekDate = options.weekDate;
  if (!weekDate) {
    const { data, error } = await supabase
      .from('regional_bestsellers')
      .select('week_date')
      .eq('region', region)
      .order('week_date', { ascending: false })
      .limit(1);
    if (error) throw new Error(`latest week query failed: ${error.message}`);
    weekDate = (data?.[0] as { week_date?: string } | undefined)?.week_date;
    if (!weekDate) throw new Error(`No bestseller data stored for region ${region}`);
  }

  const comparisonWeek = options.comparisonWeek ?? isoMinusDays(weekDate, 7);
  const abaAuthoritative = comparisonWeek === isoMinusDays(weekDate, 7);

  const currentRows = await fetchWeekRows(region, weekDate);
  if (currentRows.length === 0) {
    throw new Error(`No bestseller data stored for ${region} week ${weekDate}`);
  }
  const comparisonRows = await fetchWeekRows(region, comparisonWeek);

  // Comparison lookups: rank by category|isbn, and presence by category.
  const comparisonRank = new Map<string, number>();
  for (const r of comparisonRows) {
    comparisonRank.set(`${r.category ?? ''}|${r.isbn}`, r.rank);
  }
  const currentIsbnsByCategory = new Set(
    currentRows.map((r) => `${r.category ?? ''}|${r.isbn}`)
  );

  const toBook = (r: DbListRow): BestsellerBook => {
    const previousRank = abaAuthoritative
      ? r.last_week_rank ?? undefined
      : comparisonRank.get(`${r.category ?? ''}|${r.isbn}`);
    // ABA leaves BOTH momentum fields blank on untracked deep-list rows
    // (e.g. Mass Market #11-15): that's unknown, not new. A genuine debut
    // has a weeks-on-list value ("New / 1", "New / 143" for re-entries).
    const tracked = r.weeks_on_list !== null;
    return {
      rank: r.rank,
      title: r.title,
      author: r.author,
      publisher: r.publisher ?? '',
      price: r.price ?? '',
      isbn: r.isbn,
      previousRank,
      isNew: previousRank === undefined && tracked,
      weeksOnList: r.weeks_on_list ?? undefined,
    };
  };

  const byCategory = new Map<string, BestsellerBook[]>();
  for (const r of currentRows) {
    const cat = r.category ?? 'General';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(toBook(r));
  }

  // Books on the comparison list that are gone now.
  for (const r of comparisonRows) {
    const cat = r.category ?? 'General';
    if (currentIsbnsByCategory.has(`${r.category ?? ''}|${r.isbn}`)) continue;
    if (!byCategory.has(cat)) continue; // don't resurrect empty categories
    byCategory.get(cat)!.push({
      rank: r.rank,
      title: r.title,
      author: r.author,
      publisher: r.publisher ?? '',
      price: r.price ?? '',
      isbn: r.isbn,
      previousRank: r.rank,
      wasDropped: true,
      weeksOnList: r.weeks_on_list ?? undefined,
    });
  }

  const categories = [...byCategory.entries()]
    .sort(
      (a, b) =>
        displayOrder(a[0]) - displayOrder(b[0]) || a[0].localeCompare(b[0])
    )
    .map(([name, books]) => ({ name, books }));

  return {
    current: { title: `${region} Independent Bestsellers`, date: weekDate, categories },
    weekDate,
    comparisonWeek,
  };
}
