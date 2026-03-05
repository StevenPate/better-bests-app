import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { FetchError, ErrorCode, logError } from '@/lib/errors';
import { BestsellerList } from '@/types/bestseller';

// Audience data caching and batching
const audienceCache: Map<string, string> = new Map();
let audienceCacheExpiry: number = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

const weeksOnListCache: Map<string, number> = new Map();
let weeksCacheExpiry = 0;
const WEEKS_CACHE_DURATION = 30 * 60 * 1000;

/** @internal - exposed for unit tests */
export function __resetCachesForTests(): void {
  audienceCache.clear();
  audienceCacheExpiry = 0;
  weeksOnListCache.clear();
  weeksCacheExpiry = 0;
}

export function getDefaultAudience(categoryName: string): string {
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

export async function ensureAudienceAssignment(isbn: string, categoryName: string): Promise<void> {
  try {
    // Check if audience already exists for this ISBN
    const { data: existingAudience } = await supabase
      .from('book_audiences')
      .select('audience')
      .eq('isbn', isbn)
      .single();

    if (existingAudience) return; // Audience already assigned

    const defaultAudience = getDefaultAudience(categoryName);

    // Insert default audience
    await supabase.from('book_audiences').insert({
      isbn,
      audience: defaultAudience
    });
  } catch (error) {
    logger.error('Error ensuring audience assignment:', error);
  }
}

export async function batchGetBookAudiences(isbns: string[], region: string = 'PNBA'): Promise<Record<string, string>> {
  // Check if cache is still valid
  if (Date.now() < audienceCacheExpiry && audienceCache.size > 0) {
    const result: Record<string, string> = {};
    const uncachedIsbns = [];

    for (const isbn of isbns) {
      const cacheKey = `${region}:${isbn}`;
      if (audienceCache.has(cacheKey)) {
        result[isbn] = audienceCache.get(cacheKey)!;
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
      const newData = await fetchAudiencesFromDatabase(uncachedIsbns, region);
      Object.assign(result, newData);

      // Update cache with region-aware keys
      for (const [isbn, audience] of Object.entries(newData)) {
        audienceCache.set(`${region}:${isbn}`, audience);
      }
    }

    return result;
  }

  // Cache expired or empty, fetch all data
  const result = await fetchAudiencesFromDatabase(isbns, region);

  // Update cache with region-aware keys
  audienceCache.clear();
  for (const [isbn, audience] of Object.entries(result)) {
    audienceCache.set(`${region}:${isbn}`, audience);
  }
  audienceCacheExpiry = Date.now() + CACHE_DURATION;

  return result;
}

async function fetchAudiencesFromDatabase(isbns: string[], region: string = 'PNBA'): Promise<Record<string, string>> {
  if (isbns.length === 0) return {};

  logger.debug('BestsellerParser', 'fetchAudiencesFromDatabase called for', isbns.length, 'ISBNs in region', region);
  try {
    // Add timeout to prevent infinite hanging
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new FetchError(ErrorCode.DATA_FETCH_FAILED, { resource: 'book_audiences', operation: 'batch_query', reason: 'timeout' })), 10000) // 10 second timeout
    );

    // Use 'in' filter for batch querying, filtered by region
    const queryPromise = supabase
      .from('book_audiences')
      .select('isbn, audience')
      .eq('region', region)
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

export async function getBookAudience(isbn: string, region: string = 'PNBA'): Promise<string | null> {
  const result = await batchGetBookAudiences([isbn], region);
  return result[isbn] || null;
}

export async function updateBookAudience(isbn: string, audience: string, region: string = 'PNBA'): Promise<void> {
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
    audienceCache.set(cacheKey, audience);
  } catch (error) {
    logger.error('Error updating book audience:', error);
    throw error;
  }
}

export async function getWeeksOnList(isbn: string, region: string = 'PNBA'): Promise<number> {
  if (!isbn) {
    return 0;
  }

  try {
    const result = await batchGetWeeksOnList([isbn], region);
    return result[isbn] ?? 0;
  } catch (error) {
    logger.error('Error getting weeks count:', error);
    return 0;
  }
}

export async function batchGetWeeksOnList(isbns: string[], region: string = 'PNBA'): Promise<Record<string, number>> {
  const uniqueIsbns = Array.from(new Set(isbns.filter(isbn => Boolean(isbn))));
  if (uniqueIsbns.length === 0) {
    return {};
  }

  const now = Date.now();
  const result: Record<string, number> = {};
  const uncachedIsbns: string[] = [];
  const cacheValid = now < weeksCacheExpiry && weeksOnListCache.size > 0;

  if (cacheValid) {
    for (const isbn of uniqueIsbns) {
      if (weeksOnListCache.has(isbn)) {
        result[isbn] = weeksOnListCache.get(isbn)!;
      } else {
        uncachedIsbns.push(isbn);
      }
    }
  } else {
    uncachedIsbns.push(...uniqueIsbns);
  }

  if (uncachedIsbns.length > 0) {
    const fetched = await fetchWeeksOnListFromDatabase(uncachedIsbns, region);

    for (const [isbn, count] of Object.entries(fetched)) {
      weeksOnListCache.set(isbn, count);
      result[isbn] = count;
    }

    for (const isbn of uncachedIsbns) {
      if (!(isbn in fetched)) {
        weeksOnListCache.set(isbn, 0);
        result[isbn] = 0;
      }
    }

    weeksCacheExpiry = Date.now() + WEEKS_CACHE_DURATION;
  } else if (cacheValid) {
    // Refresh expiry when cache satisfied request fully
    weeksCacheExpiry = now + WEEKS_CACHE_DURATION;
  }

  for (const isbn of uniqueIsbns) {
    if (result[isbn] === undefined) {
      const cachedValue = weeksOnListCache.get(isbn);
      if (cachedValue !== undefined) {
        result[isbn] = cachedValue;
      } else {
        weeksOnListCache.set(isbn, 0);
        result[isbn] = 0;
      }
    }
  }

  return result;
}

async function fetchWeeksOnListFromDatabase(isbns: string[], region: string = 'PNBA'): Promise<Record<string, number>> {
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

export async function saveToDatabase(list: BestsellerList, weekDate: Date, region: string = 'PNBA'): Promise<void> {
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
          const defaultAudience = getDefaultAudience(category.name);
          audienceAssignments.push({
            isbn: book.isbn,
            audience: defaultAudience,
            region: region
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
    logger.debug('BestsellerParser', 'Skipping fallback database save - continuing with display');
  }
}
