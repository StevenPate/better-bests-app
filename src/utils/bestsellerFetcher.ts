import { BestsellerList } from '@/types/bestseller';
import { supabase } from '@/integrations/supabase/client';
import { DateUtils } from './dateUtils';
import { logger } from '@/lib/logger';
import { FetchError, ErrorCode, logError } from '@/lib/errors';
import { getRegionByAbbreviation } from '@/config/regions';
import { parseList } from './bestsellerTextParser';
import { getCachedData, setCachedData, isCurrentWeek, shouldFetchNewData, isRecentCache } from './bestsellerCache';
import {
  getDefaultAudience, ensureAudienceAssignment, batchGetBookAudiences,
  getBookAudience, updateBookAudience, getWeeksOnList, batchGetWeeksOnList,
  saveToDatabase, __resetCachesForTests
} from '@/services/bookDataService';


interface PositionHistory {
  date: string;
  position: number;
  category: string;
  isNew?: boolean;
  wasDropped?: boolean;
}

export class BestsellerParser {
  
  // Cache management — delegated to bestsellerCache module
  static getCachedData(cacheKey: string) { return getCachedData(cacheKey); }
  static setCachedData(cacheKey: string, data: unknown) { return setCachedData(cacheKey, data); }
  static isCurrentWeek(dateStr: string) { return isCurrentWeek(dateStr); }
  static isRecentCache(lastFetched: string, days: number) { return isRecentCache(lastFetched, days); }

  static async shouldFetchNewData(region: string = 'PNBA'): Promise<boolean> {
    return shouldFetchNewData(region, (key) => this.getCachedData(key));
  }
  
  // Book data service — delegated to bookDataService module
  static saveToDatabase(list: BestsellerList, weekDate: Date, region?: string) { return saveToDatabase(list, weekDate, region); }
  static getDefaultAudience(categoryName: string) { return getDefaultAudience(categoryName); }
  static ensureAudienceAssignment(isbn: string, categoryName: string) { return ensureAudienceAssignment(isbn, categoryName); }
  static batchGetBookAudiences(isbns: string[], region?: string) { return batchGetBookAudiences(isbns, region); }
  static getBookAudience(isbn: string, region?: string) { return getBookAudience(isbn, region); }
  static updateBookAudience(isbn: string, audience: string, region?: string) { return updateBookAudience(isbn, audience, region); }
  static getWeeksOnList(isbn: string, region?: string) { return getWeeksOnList(isbn, region); }
  static batchGetWeeksOnList(isbns: string[], region?: string) { return batchGetWeeksOnList(isbns, region); }
  static __resetCachesForTests() { return __resetCachesForTests(); }

  static async fetchHistoricalData(region: string = 'PNBA'): Promise<void> {
    // Check if we already have recent historical data for this region
    const cacheKey = `${region}_historical_data_complete`;
    const cachedData = await this.getCachedData(cacheKey);

    if (cachedData && this.isRecentCache(cachedData.last_fetched, 7)) {
      logger.debug(`Using cached historical data for ${region}`);
      return;
    }

    logger.debug(`Fetching historical data for ${region}...`);
    const currentDate = new Date();
    const promises = [];

    // Only fetch previous 8 weeks instead of 52 for faster loading
    for (let week = 1; week <= 8; week++) {
      const date = new Date(currentDate);
      date.setDate(date.getDate() - (week * 7));

      // Ensure it's a Wednesday
      const dayOfWeek = date.getDay();
      const daysToSubtract = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4;
      date.setDate(date.getDate() - daysToSubtract);

      promises.push(this.fetchAndStoreWeek(date, region));
    }

    // Process in smaller batches for better performance
    const batchSize = 3;
    for (let i = 0; i < promises.length; i += batchSize) {
      const batch = promises.slice(i, i + batchSize);
      await Promise.allSettled(batch);
    }

    // Mark historical data as complete for this region
    await this.setCachedData(cacheKey, { complete: true });
  }

  static async fetchAndStoreWeek(date: Date, region: string = 'PNBA'): Promise<void> {
    const dateStr = date.toISOString().split('T')[0];
    const cacheKey = `${region}_week_data_${dateStr}`;

    // Check if we already have this week's data for this region
    const cached = await this.getCachedData(cacheKey);
    if (cached) {
      logger.debug(`Using cached data for ${region} ${dateStr}`);
      return;
    }

    try {
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const dateFormatted = `${year}${month}${day}`;

      // Get file code for region
      const regionConfig = getRegionByAbbreviation(region);
      const fileCode = regionConfig?.file_code || 'pn';

      const url = `https://www.bookweb.org/sites/default/files/regional_bestseller/${dateFormatted}${fileCode}.txt`;

      // Use CORS proxy with fallback support
      const data = await this.fetchWithCorsProxy(url, 10000);

      if (data.contents) {
        const list = this.parseList(data.contents);
        await this.saveToDatabase(list, date, region);

        // Cache the successful fetch
        await this.setCachedData(cacheKey, { success: true, date: dateStr });
      }
    } catch (error) {
      logger.error(`Error fetching data for ${dateStr}:`, error);
      // Cache the failed attempt to avoid retrying immediately
      await this.setCachedData(cacheKey, { success: false, date: dateStr, error: error.message });
    }
  }

  static parseList(content: string): BestsellerList {
    return parseList(content);
  }


  static async compareLists(current: BestsellerList, previous: BestsellerList, region: string = 'PNBA'): Promise<BestsellerList> {
    logger.debug('=== COMPARISON DEBUG ===');
    logger.debug('Current list date:', current.date);
    logger.debug('Previous list date:', previous.date);
    logger.debug('Current categories:', current.categories.length);
    logger.debug('Previous categories:', previous.categories.length);
    logger.debug('Region:', region);

    // Collect all ISBNs (current + previous) for batch lookup
    const isbnSet = new Set<string>();
    current.categories.forEach(category => {
      category.books.forEach(book => {
        if (book.isbn) {
          isbnSet.add(book.isbn);
        }
      });
    });

    previous.categories.forEach(category => {
      category.books.forEach(book => {
        if (book.isbn) {
          isbnSet.add(book.isbn);
        }
      });
    });

    const weeksOnListData = await this.batchGetWeeksOnList(Array.from(isbnSet), region);
    const missingWeeksIsbns: Set<string> = new Set();

    const getWeeksCount = (isbn?: string): number => {
      if (!isbn) {
        return 0;
      }

      const value = weeksOnListData[isbn];

      if (value === undefined) {
        missingWeeksIsbns.add(isbn);
        return 0;
      }

      return value;
    };
    
    const updatedCategories = await Promise.all(current.categories.map(async currentCategory => {
      const previousCategory = previous.categories.find(cat => cat.name === currentCategory.name);
      
      logger.debug(`\n--- Category: ${currentCategory.name} ---`);
      logger.debug(`Current books: ${currentCategory.books.length}`);
      logger.debug(`Previous books: ${previousCategory?.books.length || 0}`);
      
      if (previousCategory) {
        logger.debug('Previous category books:', previousCategory.books.slice(0, 3).map(b => `${b.title} (${b.isbn})`));
      }
      
      const updatedBooks = currentCategory.books.map(currentBook => {
        // Find by ISBN first (most reliable), then fall back to title/author if no ISBN
        const previousBook = previousCategory?.books.find(book => {
          if (currentBook.isbn && book.isbn) {
            return book.isbn === currentBook.isbn;
          }
          // Fallback to title/author comparison only if ISBN not available
          return book.title === currentBook.title && book.author === currentBook.author;
        });
        
  const weeksOnList = getWeeksCount(currentBook.isbn);
        
        logger.debug(`Book: ${currentBook.title} (${currentBook.isbn}) - Found in previous: ${!!previousBook}`);
        
        if (!previousBook) {
          return { ...currentBook, isNew: true, weeksOnList };
        }
        
        return {
          ...currentBook,
          previousRank: previousBook.rank,
          isNew: false,
          weeksOnList
        };
      });

      // Add dropped books from previous week
      const droppedBooks = await Promise.all((previousCategory?.books.filter(prevBook => 
        !currentCategory.books.find(currBook => {
          if (prevBook.isbn && currBook.isbn) {
            return currBook.isbn === prevBook.isbn;
          }
          // Fallback to title/author comparison only if ISBN not available
          return currBook.title === prevBook.title && currBook.author === prevBook.author;
        })
      ) || []).map(async book => {
        const weeksOnList = getWeeksCount(book.isbn);
        return { ...book, wasDropped: true, weeksOnList };
      }));
      
      return {
        ...currentCategory,
        books: [...updatedBooks, ...droppedBooks]
      };
    }));
    
    logger.debug('=== END COMPARISON DEBUG ===');

    if (missingWeeksIsbns.size > 0) {
      logger.warn('BestsellerParser', 'Missing weeks-on-list data for ISBNs', Array.from(missingWeeksIsbns));
    }
    
    return {
      ...current,
      categories: updatedCategories
    };
  }


  /**
   * Look up cached Google Drive URLs for a specific Wednesday date from fetch_cache.
   * Returns the urls record if found, or null.
   */
  static async getCachedDriveUrls(wednesdayDate: string): Promise<Record<string, string> | null> {
    try {
      const cacheKey = `drive_urls_${wednesdayDate}`;
      const { data, error } = await supabase
        .from('fetch_cache')
        .select('data')
        .eq('cache_key', cacheKey)
        .maybeSingle();

      if (error || !data?.data) return null;
      const urls = (data.data as { urls?: Record<string, string> }).urls;
      return urls && Object.keys(urls).length > 0 ? urls : null;
    } catch {
      return null;
    }
  }

  // Cache for Google Drive URLs scraped from bookweb.org
  private static driveUrlsCache: { urls: Record<string, string>; fetchedAt: number } | null = null;
  private static readonly DRIVE_URLS_CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /**
   * Fetch Google Drive URLs from the scrape-regional-urls edge function.
   * Results are cached in memory for 1 hour.
   */
  private static async getGoogleDriveUrls(): Promise<Record<string, string>> {
    if (this.driveUrlsCache && Date.now() - this.driveUrlsCache.fetchedAt < this.DRIVE_URLS_CACHE_TTL) {
      return this.driveUrlsCache.urls;
    }

    try {
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-regional-urls`,
        {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const urls = data.urls || {};
      this.driveUrlsCache = { urls, fetchedAt: Date.now() };
      logger.debug('BestsellerParser', `Fetched ${Object.keys(urls).length} Google Drive URLs`);
      return urls;
    } catch (error) {
      logger.warn('BestsellerParser', 'Failed to fetch Google Drive URLs:', error);
      return {};
    }
  }

  // CORS proxy fallbacks (ordered by reliability)
  private static readonly CORS_PROXIES = [
    // Our own Supabase edge function (most reliable, runs on our infrastructure)
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-bestseller-file?url=`,
    // Removed unreliable public proxies that return HTML error pages as "success"
    // which triggers unwanted fallback logic
  ];

  /**
   * Tries multiple CORS proxies to fetch a URL
   * @param url The URL to fetch
   * @param timeout Timeout in milliseconds (default 10000)
   * @returns The response data with .contents property
   */
  private static async fetchWithCorsProxy(url: string, timeout: number = 10000): Promise<Record<string, unknown>> {
    let lastError: Error | null = null;

    for (const proxy of this.CORS_PROXIES) {
      try {
        const proxyUrl = proxy + encodeURIComponent(url);
        logger.debug('BestsellerParser', `Trying CORS proxy: ${proxy.split('?')[0]}...`);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new FetchError(ErrorCode.DATA_FETCH_FAILED, { resource: 'cors_proxy', proxy: proxy.split('?')[0], reason: 'timeout' })), timeout)
        );

        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const response = await Promise.race([
          fetch(proxyUrl, {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
            },
          }),
          timeoutPromise,
        ]);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Different proxies have different response formats
        const contentType = response.headers.get('content-type') || '';
        let contents: string;

        if (contentType.includes('application/json')) {
          // JSON response (e.g., allorigins.win wraps in {contents: "..."})
          const data = await response.json();
          contents = data.contents || '';
        } else {
          // Raw text response (e.g., corsproxy.io, codetabs.com)
          contents = await response.text();
        }

        // Validate that we got content
        if (!contents || contents.trim().length === 0) {
          throw new Error('Empty response from proxy');
        }

        logger.debug('BestsellerParser', `Successfully fetched via ${proxy.split('?')[0]}`);
        return {
          contents,
          proxy: proxy.split('?')[0],
        }; // Always return in same format
      } catch (error) {
        logger.warn('BestsellerParser', `Proxy ${proxy.split('?')[0]} failed:`, error.message);
        lastError = error as Error;
        // Continue to next proxy
      }
    }

    // All proxies failed
    throw new FetchError(
      ErrorCode.DATA_FETCH_FAILED,
      { resource: 'cors_proxy', operation: 'fetch', reason: 'all_proxies_failed' },
      lastError
    );
  }

  private static isValidBestsellerContent(contents: string | null | undefined): boolean {
    if (!contents) {
      return false;
    }

    const trimmed = contents.trim();
    if (trimmed.length < 500) {
      return false;
    }

    const normalized = trimmed.toLowerCase();

    if (normalized.includes('404 not found') ||
        normalized.includes('page not found') ||
        normalized.includes('<!doctype html')) {
      return false;
    }

    return true;
  }

  // Main fetch method with caching
  static async fetchBestsellerData(options?: { refresh?: boolean; comparisonWeek?: string; region?: string }): Promise<{ current: BestsellerList; previous: BestsellerList } | null> {
    logger.debug('BestsellerParser', 'fetchBestsellerData called with options:', options);
    const refresh = options?.refresh;
    const comparisonWeek = options?.comparisonWeek;
    const region = options?.region || 'PNBA'; // Default to PNBA

    // Determine cache key based on comparison week AND region
    // Add version suffix to force cache invalidation after RPC function change
    const cacheKey = comparisonWeek
      ? `${region}_bestseller_list_vs_${comparisonWeek}_v2`
      : `${region}_current_bestseller_list_v2`;
    logger.debug('BestsellerParser', 'Cache key:', cacheKey);

    // If not refreshing, prefer cached data immediately
    if (!refresh) {
      logger.debug('BestsellerParser', 'Checking for cached data...');
      const cachedData = await this.getCachedData(cacheKey);
      if (cachedData?.data) {
        // Validate cached data has actual categories; empty categories = bad cache from parse failure
        const cachedCurrent = (cachedData.data as Record<string, unknown>)?.current as Record<string, unknown> | undefined;
        if (cachedCurrent?.categories && Array.isArray(cachedCurrent.categories) && cachedCurrent.categories.length > 0) {
          logger.debug('BestsellerParser', `Using cached data for ${cacheKey} (no refresh)`);
          logger.debug('BestsellerParser', 'Cached current list date:', cachedCurrent?.date);
          return cachedData.data;
        }
        logger.warn('BestsellerParser', `Cached data for ${cacheKey} has empty categories — fetching fresh`);
      }
      logger.debug('BestsellerParser', 'No valid cached data found');
    }

    logger.debug('[BestsellerParser]', refresh ? 'Refreshing data from bookweb.org' : 'Fetching new data from bookweb.org');

    try {
      const currentWednesday = DateUtils.getMostRecentWednesday();
      let previousWednesday = new Date(currentWednesday);

      logger.debug('BestsellerParser', 'Attempting to fetch for Wednesday:', currentWednesday.toDateString());

      // Use custom comparison week if provided
      if (comparisonWeek) {
        logger.debug('BestsellerParser', 'Using custom comparison week:', comparisonWeek);
        // Create date in local timezone to avoid UTC conversion issues
        const [year, month, day] = comparisonWeek.split('-').map(Number);
        const base = new Date(year, month - 1, day); // month is 0-indexed

        // Normalize to that week's Wednesday (files are named by Wednesday)
        // PNBA files are published on Wednesday, 3 days after the Sunday list date
        const dayOfWeek = base.getDay(); // 0=Sun ... 3=Wed
        let daysToAdd: number;
        if (dayOfWeek <= 3) {
          // Sun-Wed: Find Wednesday in the same week
          daysToAdd = 3 - dayOfWeek;
        } else {
          // Thu-Sat: Find Wednesday in the following week
          daysToAdd = 10 - dayOfWeek;
        }
        previousWednesday = new Date(base);
        previousWednesday.setDate(base.getDate() + daysToAdd);
        previousWednesday.setHours(0, 0, 0, 0);
      } else {
        previousWednesday.setDate(currentWednesday.getDate() - 7);
      }

      // Discover Google Drive URLs for current week
      const driveUrls = await this.getGoogleDriveUrls();

      // Look up cached Drive URLs for the previous/comparison week
      const prevWedISO = previousWednesday.toISOString().split('T')[0];
      const previousDriveUrls = await this.getCachedDriveUrls(prevWedISO);

      // bookweb.org retired its .txt regional bestseller files around this date —
      // anything published on/after returns 404 there. We must have a Google Drive
      // URL or we have no source.
      const BOOKWEB_TXT_RETIRED = new Date('2026-06-10T00:00:00');
      if (currentWednesday >= BOOKWEB_TXT_RETIRED && !driveUrls[region]) {
        throw new FetchError(
          ErrorCode.DATA_FETCH_FAILED,
          { resource: 'drive_urls', region, week: currentWednesday.toISOString().split('T')[0], reason: 'current_drive_url_missing' }
        );
      }
      if (previousWednesday >= BOOKWEB_TXT_RETIRED && !previousDriveUrls?.[region]) {
        throw new FetchError(
          ErrorCode.DATA_FETCH_FAILED,
          { resource: 'drive_urls', region, week: prevWedISO, reason: 'previous_drive_url_missing' }
        );
      }

      // Try to fetch current week first
      const { current, previous } = this.getListUrls(currentWednesday, previousWednesday, region, driveUrls, previousDriveUrls ?? undefined);

      logger.debug('BestsellerParser', 'Fetching URLs:', { current, previous });
      logger.debug('BestsellerParser', 'Starting parallel fetch with proxy fallbacks...');

      // Use CORS proxy with fallback support
      const [currentData, previousData] = await Promise.all([
        this.fetchWithCorsProxy(current),
        this.fetchWithCorsProxy(previous)
      ]);
      logger.debug('BestsellerParser', 'Fetch completed successfully');

      // Check if current week's data is actually available (not a 404 page)
  const currentHasContent = this.isValidBestsellerContent(currentData.contents);
  const previousHasContent = this.isValidBestsellerContent(previousData.contents);

      if (!currentHasContent) {
        logger.warn(
          'BestsellerParser',
          'Current week content validation failed',
          {
            proxy: currentData?.proxy,
            length: currentData?.contents ? currentData.contents.length : 0,
            sample: currentData?.contents ? currentData.contents.slice(0, 120) : 'no-content',
          }
        );
      }

      logger.debug('BestsellerParser', 'Current week has content:', currentHasContent);
      logger.debug('BestsellerParser', 'Previous week has content:', previousHasContent);

      if (!previousHasContent) {
        throw new FetchError(
          ErrorCode.DATA_FETCH_FAILED,
          { resource: 'bestseller_data', operation: 'fetch', reason: 'previous_week_invalid' }
        );
      }

      // If the latest data is missing or invalid, shift "current" back one week.
      // Keep the comparison week unchanged (fixes the old mutation bug that caused wrong dates).
      if (!currentHasContent) {
        logger.debug(
          'BestsellerParser',
          'Current week data not available, falling back to previous week'
        );

        // New "current" = one week earlier (do NOT mutate the original dates)
        const fallbackCurrentWed = new Date(currentWednesday);
        fallbackCurrentWed.setDate(currentWednesday.getDate() - 7);

        let fallbackCurrentData: Record<string, unknown>;
        let fallbackPreviousData: Record<string, unknown>;
        let fallbackPreviousWed: Date;

        if (comparisonWeek) {
          // Custom comparison: previousData is the comparison date data (keep it).
          // Need to fetch the fallback "current" (one week back).
          const fallbackCurrentUrl = this.getListUrls(fallbackCurrentWed, previousWednesday, region).current;
          fallbackCurrentData = await this.fetchWithCorsProxy(fallbackCurrentUrl);
          fallbackPreviousData = previousData;
          fallbackPreviousWed = previousWednesday;
        } else {
          // Default comparison: previousData is for currentWednesday − 7 (= fallback current).
          // Need to fetch fallback "previous" (two weeks back).
          fallbackCurrentData = previousData;
          fallbackPreviousWed = new Date(fallbackCurrentWed);
          fallbackPreviousWed.setDate(fallbackCurrentWed.getDate() - 7);
          const fallbackPrevUrl = this.getListUrls(fallbackCurrentWed, fallbackPreviousWed, region).previous;
          fallbackPreviousData = await this.fetchWithCorsProxy(fallbackPrevUrl);
        }

        if (!this.isValidBestsellerContent(fallbackCurrentData.contents as string) ||
            !this.isValidBestsellerContent(fallbackPreviousData.contents as string)) {
          throw new FetchError(ErrorCode.DATA_FETCH_FAILED, { resource: 'bestseller_data', operation: 'fetch', reason: 'no_valid_data' });
        }

        const currentList = this.parseList(fallbackCurrentData.contents as string);
        const previousList = this.parseList(fallbackPreviousData.contents as string);

        logger.debug('Using fallback - Current list date:', currentList.date);
        logger.debug('Using fallback - Previous list date:', previousList.date);

        await this.saveToDatabase(currentList, fallbackCurrentWed, region);

        if (comparisonWeek) {
          await this.saveToDatabase(previousList, fallbackPreviousWed, region);
        }

        const comparedList = await this.compareLists(currentList, previousList, region);
        const result = { current: comparedList, previous: previousList };
        await this.setCachedData(cacheKey, result);
        return result;
      }

      // Current week's data is available, use it normally
      const currentList = this.parseList(currentData.contents);
      const previousList = this.parseList(previousData.contents);

      logger.debug('Parsed current list date:', currentList.date);
      logger.debug('Parsed previous list date:', previousList.date);

      // Save current list to database
      await this.saveToDatabase(currentList, currentWednesday, region);

      // Save comparison week list to database if it's a custom week
      if (comparisonWeek) {
        await this.saveToDatabase(previousList, previousWednesday, region);
      }

      const comparedList = await this.compareLists(currentList, previousList, region);

      const result = { current: comparedList, previous: previousList };

      // Cache the result with appropriate key
      await this.setCachedData(cacheKey, result);

      return result;
    } catch (error) {
      logger.error('Error fetching bestseller data:', error);

      // Try to return cached data as fallback
      const cachedData = await this.getCachedData(cacheKey);
      if (cachedData?.data) {
        logger.debug('Returning cached data as fallback');
        return cachedData.data;
      }

      // If comparison fetch failed, fall back to current week cache (has comparison data built-in)
      if (comparisonWeek) {
        const currentCacheKey = `${region}_current_bestseller_list_v2`;
        const currentCached = await this.getCachedData(currentCacheKey);
        if (currentCached?.data) {
          logger.debug('BestsellerParser', 'Comparison fetch failed, falling back to current week cache');
          return currentCached.data;
        }
      }

      // No cache available - backend job needs to run
      logger.error('BestsellerParser', 'No cached data found. Backend job needs to fetch data.');
      throw new Error('No data available. Please wait for the backend job to fetch data, or trigger it manually.');
    }
  }

  static async getBookHistory(isbn: string): Promise<PositionHistory[]> {
    try {
      // Query the database for historical positions of this book
      const { data, error } = await supabase
        .from('book_positions')
        .select('*')
        .eq('isbn', isbn)
        .order('week_date', { ascending: false });

      if (error) {
        logger.error('Error fetching book history:', error);
        return [];
      }

      // Remove duplicates by creating a map keyed by week_date, keeping the first occurrence
      const uniqueWeeks = new Map<string, Record<string, unknown>>();
      data?.forEach(record => {
        if (!uniqueWeeks.has(record.week_date)) {
          uniqueWeeks.set(record.week_date, record);
        }
      });

      return Array.from(uniqueWeeks.values()).map(record => ({
        date: record.week_date,
        position: record.rank,
        category: record.category,
        isNew: false,
        wasDropped: false
      }));
    } catch (error) {
      logger.error('Error getting book history:', error);
      return [];
    }
  }

  static getListUrls(currentWednesday?: Date, previousWednesday?: Date, region: string = 'PNBA', driveUrls?: Record<string, string>, previousDriveUrls?: Record<string, string>) {
    if (!currentWednesday) currentWednesday = DateUtils.getMostRecentWednesday();
    if (!previousWednesday) {
      previousWednesday = DateUtils.getPreviousWednesday();
    }

    // Get file code for region
    const regionConfig = getRegionByAbbreviation(region);
    const fileCode = regionConfig?.file_code || 'pn'; // Default to PNBA file code

    const bookwebBase = 'https://www.bookweb.org/sites/default/files/regional_bestseller/';

    // Use Google Drive URL for current week if available
    const driveUrl = driveUrls?.[region];
    const current = driveUrl || `${bookwebBase}${DateUtils.formatAsYYMMDD(currentWednesday)}${fileCode}.txt`;

    // Use cached Drive URL for previous week if available; fall back to bookweb.org .txt
    const prevDriveUrl = previousDriveUrls?.[region];
    const previous = prevDriveUrl || `${bookwebBase}${DateUtils.formatAsYYMMDD(previousWednesday)}${fileCode}.txt`;

    return { current, previous };
  }
}