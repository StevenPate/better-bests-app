import { BestsellerList, BestsellerCategory, BestsellerBook } from '@/types/bestseller';
import { supabase } from '@/integrations/supabase/client';
import { DateUtils } from './dateUtils';
import { logger } from '@/lib/logger';
import { FetchError, ErrorCode, logError } from '@/lib/errors';
import { getRegionByAbbreviation } from '@/config/regions';


interface PositionHistory {
  date: string;
  position: number;
  category: string;
  isNew?: boolean;
  wasDropped?: boolean;
}

export class BestsellerParser {
  
  // Cache management methods
  static async getCachedData(cacheKey: string): Promise<any | null> {
    logger.debug('BestsellerParser', 'getCachedData called for key:', cacheKey);
    try {
      logger.debug('BestsellerParser', 'Querying Supabase fetch_cache table...');

      // Add timeout to prevent infinite hanging
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new FetchError(ErrorCode.DATA_FETCH_FAILED, { resource: 'fetch_cache', operation: 'query', reason: 'timeout' })), 10000) // 10 second timeout
      );

      const queryPromise = supabase
        .from('fetch_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .order('last_fetched', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      logger.debug('BestsellerParser', 'Supabase query completed, error:', error, 'data:', data ? 'found' : 'null');
      if (error) {
        logger.error('BestsellerParser', 'Supabase error:', error);
        return null;
      }
      return data;
    } catch (error) {
      logError('BestsellerParser', error, { operation: 'getCachedData', cacheKey });
      return null;
    }
  }

  static async setCachedData(cacheKey: string, data: any): Promise<void> {
    logger.debug('BestsellerParser', 'setCachedData called for key:', cacheKey);
    try {
      // Add timeout to prevent infinite hanging
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new FetchError(ErrorCode.DATA_FETCH_FAILED, { resource: 'fetch_cache', operation: 'upsert', reason: 'timeout' })), 10000) // 10 second timeout
      );

      // Upsert cache row (insert or update if exists)
      const upsertPromise = supabase
        .from('fetch_cache')
        .upsert({
          cache_key: cacheKey,
          data,
          last_fetched: new Date().toISOString(),
        }, {
          onConflict: 'cache_key'
        })
        .select('id')
        .single();

      const { data: upserted, error } = await Promise.race([upsertPromise, timeoutPromise]);

      if (!error && upserted?.id) {
        logger.debug('BestsellerParser', 'Cache updated successfully');
      } else if (error) {
        logger.error('BestsellerParser', 'Error upserting cache:', error);
      }
    } catch (error) {
      logError('BestsellerParser', error, { operation: 'setCachedData', cacheKey });
    }
  }

  static isCurrentWeek(dateStr: string): boolean {
    const cachedDate = new Date(dateStr);
    const mostRecentWednesday = DateUtils.getMostRecentWednesday();

    // Check if the cached data is from the current week
    return cachedDate.toDateString() === mostRecentWednesday.toDateString();
  }

  static async shouldFetchNewData(region: string = 'PNBA'): Promise<boolean> {
    const cacheKey = `${region}_current_bestseller_list_v2`;
    const cachedData = await this.getCachedData(cacheKey);

    // If nothing cached yet, fetch now
    if (!cachedData) return true;

    const now = new Date();
    const last = new Date(cachedData.last_fetched);

    // Check if cache is stale (> 7 days old)
    const cacheAge = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
    if (cacheAge > 7) {
      logger.debug('BestsellerParser', `Cache for ${region} is stale (> 7 days), forcing refresh`);
      return true;
    }

    const isWednesday = now.getDay() === 3; // 0=Sun ... 3=Wed

    // Only attempt to fetch a new list on Wednesdays
    if (!isWednesday) return false;

    // On Wednesdays, only fetch once per day (avoid repeated checks)
    return last.toDateString() !== now.toDateString();
  }

  static isRecentCache(lastFetched: string, days: number): boolean {
    const cachedDate = new Date(lastFetched);
    const now = new Date();
    const daysDiff = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff < days;
  }
  
  static async saveToDatabase(list: BestsellerList, weekDate: Date, region: string = 'PNBA'): Promise<void> {
    logger.debug('BestsellerParser', 'saveToDatabase called for date:', weekDate.toISOString().split('T')[0], 'region:', region);
    const weekDateStr = weekDate.toISOString().split('T')[0];

    // Batch insert for better performance using edge function
    const bookPositions = [];
    const audienceAssignments = [];

    for (const category of list.categories) {
      for (const book of category.books) {
        if (!book.wasDropped) {
          bookPositions.push({
            isbn: book.isbn,
            title: book.title,
            author: book.author,
            publisher: book.publisher,
            category: category.name,
            rank: book.rank,
            price: book.price,
            week_date: weekDateStr,
            list_title: list.title
          });

          // Prepare audience assignment if ISBN exists
          if (book.isbn) {
            const defaultAudience = this.getDefaultAudience(category.name);
            audienceAssignments.push({
              isbn: book.isbn,
              audience: defaultAudience,
              region: region  // Add the region field from parameter
            });
          }
        }
      }
    }

    logger.debug('BestsellerParser', 'Prepared', bookPositions.length, 'book positions and', audienceAssignments.length, 'audience assignments');

    try {
      // Add timeout to edge function calls (30 seconds for database operations)
      const timeoutDuration = 30000;

      // Use edge function for better performance on large batches
      if (bookPositions.length > 0) {
        logger.debug('BestsellerParser', 'Calling batch-operations edge function for positions...');
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new FetchError(ErrorCode.DATA_FETCH_FAILED, { resource: 'edge_function', operation: 'batch_book_positions', reason: 'timeout' })), timeoutDuration)
        );

        const invokePromise = supabase.functions.invoke('batch-operations', {
          body: {
            operation: 'batch_book_positions',
            data: { positions: bookPositions }
          }
        });

        await Promise.race([invokePromise, timeoutPromise]);
        logger.debug('BestsellerParser', 'Book positions saved successfully');
      }

      // Batch insert audience assignments (only if not exists)
      if (audienceAssignments.length > 0) {
        logger.debug('BestsellerParser', 'Calling batch-operations edge function for audiences...');
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new FetchError(ErrorCode.DATA_FETCH_FAILED, { resource: 'edge_function', operation: 'batch_audience_assignments', reason: 'timeout' })), timeoutDuration)
        );

        const invokePromise = supabase.functions.invoke('batch-operations', {
          body: {
            operation: 'batch_audience_assignments',
            data: { assignments: audienceAssignments }
          }
        });

        await Promise.race([invokePromise, timeoutPromise]);
        logger.debug('BestsellerParser', 'Audience assignments saved successfully');
      }
    } catch (error) {
      logError('BestsellerParser', error, { operation: 'saveToDatabase', bookCount: bookPositions.length });
      // Fallback to direct client operations (skip this to speed up - database save is not critical for display)
      logger.debug('BestsellerParser', 'Skipping fallback database save - continuing with display');
      // Note: We're intentionally NOT throwing here to allow the app to continue working
      // even if database saves fail
    }
  }

  static getDefaultAudience(categoryName: string): string {
    const adultCategories = [
      'Hardcover Fiction', 'Hardcover Nonfiction', 
      'Trade Paperback Fiction', 'Trade Paperback Nonfiction', 
      'Mass Market Paperback'
    ];
    
    const childrenCategories = [
      'Children\'s Illustrated', 'Early & Middle Grade Readers', 
      'Children\'s Series Titles'
    ];

    if (adultCategories.includes(categoryName)) {
      return 'A';
    } else if (childrenCategories.includes(categoryName)) {
      return 'C';
    } else if (categoryName === 'Young Adult') {
      return 'T';
    }
    
    return 'A'; // Default to Adult
  }

  static async ensureAudienceAssignment(isbn: string, categoryName: string): Promise<void> {
    try {
      // Check if audience already exists for this ISBN
      const { data: existingAudience } = await supabase
        .from('book_audiences')
        .select('audience')
        .eq('isbn', isbn)
        .single();

      if (existingAudience) return; // Audience already assigned

      // Determine default audience based on category
      let defaultAudience = 'A'; // Default to Adult

      const adultCategories = [
        'Hardcover Fiction', 'Hardcover Nonfiction', 
        'Trade Paperback Fiction', 'Trade Paperback Nonfiction', 
        'Mass Market Paperback'
      ];
      
      const childrenCategories = [
        'Children\'s Illustrated', 'Early & Middle Grade Readers', 
        'Children\'s Series Titles'
      ];

      if (adultCategories.includes(categoryName)) {
        defaultAudience = 'A';
      } else if (childrenCategories.includes(categoryName)) {
        defaultAudience = 'C';
      } else if (categoryName === 'Young Adult') {
        defaultAudience = 'T';
      }

      // Insert default audience
      await supabase.from('book_audiences').insert({
        isbn,
        audience: defaultAudience
      });
    } catch (error) {
      logger.error('Error ensuring audience assignment:', error);
    }
  }

  // Audience data caching and batching
  private static audienceCache: Map<string, string> = new Map();
  private static audienceCacheExpiry: number = 0;
  private static readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  private static weeksOnListCache: Map<string, number> = new Map();
  private static weeksCacheExpiry = 0;
  private static readonly WEEKS_CACHE_DURATION = 30 * 60 * 1000;

  /** @internal - exposed for unit tests */
  static __resetCachesForTests(): void {
    this.audienceCache.clear();
    this.audienceCacheExpiry = 0;
    this.weeksOnListCache.clear();
    this.weeksCacheExpiry = 0;
  }

  static async batchGetBookAudiences(isbns: string[]): Promise<Record<string, string>> {
    // Check if cache is still valid
    if (Date.now() < this.audienceCacheExpiry && this.audienceCache.size > 0) {
      const result: Record<string, string> = {};
      const uncachedIsbns = [];
      
      for (const isbn of isbns) {
        if (this.audienceCache.has(isbn)) {
          result[isbn] = this.audienceCache.get(isbn)!;
        } else {
          uncachedIsbns.push(isbn);
        }
      }
      
      // If all data is cached, return immediately
      if (uncachedIsbns.length === 0) {
        return result;
      }
      
      // Fetch only uncached data
      if (uncachedIsbns.length > 0) {
        const newData = await this.fetchAudiencesFromDatabase(uncachedIsbns);
        Object.assign(result, newData);
        
        // Update cache
        for (const [isbn, audience] of Object.entries(newData)) {
          this.audienceCache.set(isbn, audience);
        }
      }
      
      return result;
    }

    // Cache expired or empty, fetch all data
    const result = await this.fetchAudiencesFromDatabase(isbns);
    
    // Update cache
    this.audienceCache.clear();
    for (const [isbn, audience] of Object.entries(result)) {
      this.audienceCache.set(isbn, audience);
    }
    this.audienceCacheExpiry = Date.now() + this.CACHE_DURATION;
    
    return result;
  }

  private static async fetchAudiencesFromDatabase(isbns: string[]): Promise<Record<string, string>> {
    if (isbns.length === 0) return {};

    logger.debug('BestsellerParser', 'fetchAudiencesFromDatabase called for', isbns.length, 'ISBNs');
    try {
      // Add timeout to prevent infinite hanging
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new FetchError(ErrorCode.DATA_FETCH_FAILED, { resource: 'book_audiences', operation: 'batch_query', reason: 'timeout' })), 10000) // 10 second timeout
      );

      // Use 'in' filter for batch querying
      const queryPromise = supabase
        .from('book_audiences')
        .select('isbn, audience')
        .in('isbn', isbns);

      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (error) {
        logger.error('BestsellerParser', 'Error fetching batch audience data:', error);
        return {};
      }

      const result: Record<string, string> = {};
      data?.forEach(item => {
        result[item.isbn] = item.audience;
      });

      logger.debug('BestsellerParser', 'Fetched', Object.keys(result).length, 'audience assignments');
      return result;
    } catch (error) {
      logger.error('BestsellerParser', 'Exception in batch audience fetch:', error);
      return {};
    }
  }

  static async getBookAudience(isbn: string): Promise<string | null> {
    const result = await this.batchGetBookAudiences([isbn]);
    return result[isbn] || null;
  }

  static async updateBookAudience(isbn: string, audience: string, region: string = 'PNBA'): Promise<void> {
    try {
      const { error } = await supabase.from('book_audiences').upsert({
        isbn,
        audience,
        region
      }, {
        onConflict: 'region,isbn'
      });

      if (error) {
        logger.error('Supabase error updating book audience:', error);
        throw error;
      }

      // Update cache with region-aware key
      const cacheKey = `${region}:${isbn}`;
      this.audienceCache.set(cacheKey, audience);
    } catch (error) {
      logger.error('Error updating book audience:', error);
      throw error;
    }
  }

  static async getWeeksOnList(isbn: string, region: string = 'PNBA'): Promise<number> {
    if (!isbn) {
      return 0;
    }

    try {
      const result = await this.batchGetWeeksOnList([isbn], region);
      return result[isbn] ?? 0;
    } catch (error) {
      logger.error('Error getting weeks count:', error);
      return 0;
    }
  }

  // Batch weeks on list lookup for better performance
  static async batchGetWeeksOnList(isbns: string[], region: string = 'PNBA'): Promise<Record<string, number>> {
    const uniqueIsbns = Array.from(new Set(isbns.filter(isbn => Boolean(isbn))));
    if (uniqueIsbns.length === 0) {
      return {};
    }

    const now = Date.now();
    const result: Record<string, number> = {};
    const uncachedIsbns: string[] = [];
    const cacheValid = now < this.weeksCacheExpiry && this.weeksOnListCache.size > 0;

    if (cacheValid) {
      for (const isbn of uniqueIsbns) {
        if (this.weeksOnListCache.has(isbn)) {
          result[isbn] = this.weeksOnListCache.get(isbn)!;
        } else {
          uncachedIsbns.push(isbn);
        }
      }
    } else {
      uncachedIsbns.push(...uniqueIsbns);
    }

    if (uncachedIsbns.length > 0) {
      const fetched = await this.fetchWeeksOnListFromDatabase(uncachedIsbns, region);

      for (const [isbn, count] of Object.entries(fetched)) {
        this.weeksOnListCache.set(isbn, count);
        result[isbn] = count;
      }

      for (const isbn of uncachedIsbns) {
        if (!(isbn in fetched)) {
          this.weeksOnListCache.set(isbn, 0);
          result[isbn] = 0;
        }
      }

      this.weeksCacheExpiry = Date.now() + this.WEEKS_CACHE_DURATION;
    } else if (cacheValid) {
      // Refresh expiry when cache satisfied request fully
      this.weeksCacheExpiry = now + this.WEEKS_CACHE_DURATION;
    }

    for (const isbn of uniqueIsbns) {
      if (result[isbn] === undefined) {
        const cachedValue = this.weeksOnListCache.get(isbn);
        if (cachedValue !== undefined) {
          result[isbn] = cachedValue;
        } else {
          this.weeksOnListCache.set(isbn, 0);
          result[isbn] = 0;
        }
      }
    }

    return result;
  }

  private static async fetchWeeksOnListFromDatabase(isbns: string[], region: string = 'PNBA'): Promise<Record<string, number>> {
    if (isbns.length === 0) {
      return {};
    }

    logger.debug('BestsellerParser', 'fetchWeeksOnListFromDatabase called for', isbns.length, 'ISBNs', 'region:', region);
    const start = Date.now();

    try {
      const { data, error } = await supabase.rpc('get_weeks_on_list_batch_regional', {
        isbn_list: isbns,
        target_region: region,
      });

      const durationMs = Date.now() - start;
      logger.debug('BestsellerParser', 'Weeks-on-list RPC completed', {
        requested: isbns.length,
        returned: data?.length ?? 0,
        durationMs,
      });

      if (error) {
        logger.error('BestsellerParser', 'Error fetching weeks-on-list batch:', error);
        return {};
      }

      const result: Record<string, number> = {};

      data?.forEach((row: { isbn: string; weeks_on_list: number | string | null }) => {
        if (row && typeof row.isbn === 'string') {
          const weeksRaw = row.weeks_on_list;
          const weeksValue = typeof weeksRaw === 'number'
            ? weeksRaw
            : parseInt(String(weeksRaw ?? '0'), 10);

          result[row.isbn] = Number.isFinite(weeksValue) ? weeksValue : 0;
        }
      });

      if ((data?.length ?? 0) < isbns.length) {
        logger.warn('BestsellerParser', 'Weeks-on-list RPC returned fewer rows than requested', {
          requested: isbns.length,
          returned: data?.length ?? 0,
        });
      }

      return result;
    } catch (error) {
      logger.error('BestsellerParser', 'Exception in weeks-on-list RPC:', error);
      return {};
    }
  }

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
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    let title = '';
    let date = '';
    const categories: BestsellerCategory[] = [];
    let currentCategory: BestsellerCategory | null = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Extract title and date from header
      if (i < 5 && line.toLowerCase().includes('bestsellers')) {
        title = line;
      }
      
      if (i < 5 && line.includes('week ended')) {
        const dateMatch = line.match(/week ended (\w+, \w+ \d+, \d+)/);
        if (dateMatch) {
          date = dateMatch[1];
        }
      }
      
      // Check if this line is a category header
      if (this.isCategoryHeader(line)) {
        if (currentCategory) {
          categories.push(currentCategory);
        }
        currentCategory = {
          name: this.formatCategoryName(line),
          books: []
        };
        continue;
      }
      
      // Check if this line is a book entry
      if (currentCategory && this.isBookEntry(line)) {
        const result = this.parseBookEntryWithLookahead(line, lines, i);
        if (result.book) {
          currentCategory.books.push(result.book);
          // Skip the lines we've already processed
          i = result.nextIndex - 1; // -1 because the for loop will increment
        }
      }
    }
    
    if (currentCategory) {
      categories.push(currentCategory);
    }
    
    return {
      title: title || 'Better Bestsellers',
      date,
      categories
    };
  }

  private static isCategoryHeader(line: string): boolean {
    return line === line.toUpperCase() && 
           line.length > 3 && 
           !line.match(/^\d/) &&
           !line.includes('$') &&
           !line.includes('978') && 
           line.includes(' ');
  }

  private static isBookEntry(line: string): boolean {
    return /^\d+\.\s/.test(line);
  }

  private static parseBookEntryWithLookahead(titleLine: string, lines: string[], startIndex: number): { book: BestsellerBook | null; nextIndex: number } {
    const titleMatch = titleLine.match(/^(\d+)\.\s(.+)$/);
    if (!titleMatch) {
      return { book: null, nextIndex: startIndex + 1 };
    }
    
    const rank = parseInt(titleMatch[1]);
    let title = titleMatch[2];
    
    // Look ahead to find the detail line (contains ISBN, price, or author info)
    let detailLineIndex = startIndex + 1;
    let detailLine = '';
    
    while (detailLineIndex < lines.length) {
      const candidateLine = lines[detailLineIndex];
      
      // Stop if we hit another book entry
      if (this.isBookEntry(candidateLine)) {
        break;
      }
      
      // Stop if we hit a category header
      if (this.isCategoryHeader(candidateLine)) {
        break;
      }
      
      // Check if this line looks like a detail line (has ISBN, price, or typical author/publisher structure)
      if (this.isDetailLine(candidateLine)) {
        detailLine = candidateLine;
        break;
      }
      
      // This line is likely a continuation of the title
      title += ' ' + candidateLine;
      detailLineIndex++;
    }
    
    if (!detailLine) {
      return { book: null, nextIndex: detailLineIndex };
    }
    
    const isbnMatch = detailLine.match(/978\d{10}|979\d{10}/);
    const isbn = isbnMatch ? isbnMatch[0] : '';
    
    const priceMatch = detailLine.match(/\$[\d,]+\.?\d*/);
    const price = priceMatch ? priceMatch[0] : '';
    
    let authorPublisher = detailLine;
    if (isbn) authorPublisher = authorPublisher.replace(isbn, '');
    if (price) authorPublisher = authorPublisher.replace(price, '');
    
    authorPublisher = authorPublisher.replace(/,\s*,/g, ',').replace(/,\s*$/, '').trim();
    const parts = authorPublisher.split(',').map(part => part.trim()).filter(part => part.length > 0);
    
    const author = parts[0] || 'Unknown Author';
    const publisher = parts[1] || 'Unknown Publisher';
    
    return {
      book: {
        rank,
        title: title.trim(),
        author,
        publisher,
        price,
        isbn
      },
      nextIndex: detailLineIndex + 1
    };
  }

  private static isDetailLine(line: string): boolean {
    // A detail line typically contains:
    // 1. ISBN (978 or 979 followed by 10 digits)
    // 2. Price ($X.XX format)
    // 3. Multiple comma-separated parts (author, publisher, etc.)
    
    const hasIsbn = /978\d{10}|979\d{10}/.test(line);
    const hasPrice = /\$[\d,]+\.?\d*/.test(line);
    const hasMultipleCommas = (line.match(/,/g) || []).length >= 1;
    
    // If it has ISBN or price, it's definitely a detail line
    if (hasIsbn || hasPrice) {
      return true;
    }
    
    // If it has multiple commas, it's likely author, publisher info
    if (hasMultipleCommas && line.length > 10) {
      return true;
    }
    
    return false;
  }


  private static formatCategoryName(categoryLine: string): string {
    return categoryLine
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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
  private static async fetchWithCorsProxy(url: string, timeout: number = 10000): Promise<any> {
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
      let currentWednesday = DateUtils.getMostRecentWednesday();
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
      const uniqueWeeks = new Map<string, any>();
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