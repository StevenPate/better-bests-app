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

        const response = await Promise.race([fetch(proxyUrl), timeoutPromise]);

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
        logger.debug('BestsellerParser', `Using cached data for ${cacheKey} (no refresh)`);
        logger.debug('BestsellerParser', 'Cached current list date:', cachedData.data.current?.date);
        return cachedData.data;
      }
      logger.debug('BestsellerParser', 'No cached data found');
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

      // Try to fetch current week first
      const { current, previous } = this.getListUrls(currentWednesday, previousWednesday, region);

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

      // If the latest data is missing or invalid, shift everything back by one week
      if (!currentHasContent) {
        logger.debug(
          'BestsellerParser',
          'Current week data not available, falling back to previous week'
        );

        // TEMPORARILY DISABLED: Fallback logic causing date issues
        // TODO: Re-enable once edge function validation is refined
        throw new FetchError(
          ErrorCode.DATA_FETCH_FAILED,
          { resource: 'bestseller_data', operation: 'fetch', reason: 'current_week_unavailable' }
        );

        /* DISABLED FALLBACK LOGIC - causing Oct 19 date issue
        // Use last week as "current" and two weeks ago as "previous"
        currentWednesday.setDate(currentWednesday.getDate() - 7);
        previousWednesday.setDate(previousWednesday.getDate() - 7);

        const fallbackUrls = this.getListUrls(currentWednesday, previousWednesday, region);

        const [fallbackCurrentData, fallbackPreviousData] = await Promise.all([
          this.fetchWithCorsProxy(fallbackUrls.current),
          this.fetchWithCorsProxy(fallbackUrls.previous)
        ]);

        if (!this.isValidBestsellerContent(fallbackCurrentData.contents) ||
            !this.isValidBestsellerContent(fallbackPreviousData.contents)) {
          throw new FetchError(ErrorCode.DATA_FETCH_FAILED, { resource: 'bestseller_data', operation: 'fetch', reason: 'no_valid_data' });
        }

        const currentList = this.parseList(fallbackCurrentData.contents);
        const previousList = this.parseList(fallbackPreviousData.contents);

        logger.debug('Using fallback - Current list date:', currentList.date);
        logger.debug('Using fallback - Previous list date:', previousList.date);

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
        */
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

  static getListUrls(currentWednesday?: Date, previousWednesday?: Date, region: string = 'PNBA') {
    if (!currentWednesday) currentWednesday = DateUtils.getMostRecentWednesday();
    if (!previousWednesday) {
      previousWednesday = DateUtils.getPreviousWednesday();
    }

    // Get file code for region
    const regionConfig = getRegionByAbbreviation(region);
    const fileCode = regionConfig?.file_code || 'pn'; // Default to PNBA file code

    const current = `https://www.bookweb.org/sites/default/files/regional_bestseller/${DateUtils.formatAsYYMMDD(currentWednesday)}${fileCode}.txt`;
    const previous = `https://www.bookweb.org/sites/default/files/regional_bestseller/${DateUtils.formatAsYYMMDD(previousWednesday)}${fileCode}.txt`;

    return { current, previous };
  }
}