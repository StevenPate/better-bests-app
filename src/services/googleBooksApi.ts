/**
 * Google Books API Service
 *
 * Provides functions for fetching book metadata from Google Books API
 * with two-tier caching (in-memory + Supabase), parallel fetching, and error handling.
 *
 * Cache Strategy:
 * - Layer 1: In-memory cache (30 minutes) - Fast lookups within same session
 * - Layer 2: Supabase persistent cache (30 days) - Shared across users and sessions
 * - Layer 3: Google Books API - Fallback when cache misses
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { FetchError, ErrorCode, logError } from '@/lib/errors';

interface GoogleBooksVolume {
  volumeInfo: {
    title?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    imageLinks?: {
      thumbnail?: string;
      small?: string;
      medium?: string;
      large?: string;
    };
    industryIdentifiers?: Array<{
      type: string;
      identifier: string;
    }>;
  };
}

interface GoogleBooksResponse {
  items?: GoogleBooksVolume[];
}

interface BookCategory {
  isbn: string;
  category: string;
}

/**
 * Cached book information - stores full volumeInfo from Google Books API
 * Used as unified cache to avoid multiple API calls for the same book
 */
export interface CachedBookInfo {
  title?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories?: string[];
  imageLinks?: {
    thumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
  };
  industryIdentifiers?: Array<{
    type: string;
    identifier: string;
  }>;
  // Flag to indicate we looked up this ISBN but found no results
  _notFound?: boolean;
}

// In-memory cache for Google Books data with TTL
class GoogleBooksCache<T> {
  private cache: Map<string, { data: T; timestamp: number }> = new Map();
  private readonly TTL = 30 * 60 * 1000; // 30 minutes

  set(isbn: string, data: T): void {
    this.cache.set(isbn, {
      data,
      timestamp: Date.now()
    });
  }

  get(isbn: string): T | null {
    const entry = this.cache.get(isbn);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(isbn);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }
}

// Unified book info cache - stores full volumeInfo from Google Books
const bookInfoCache = new GoogleBooksCache<CachedBookInfo>();

// Legacy individual caches (kept for backward compatibility during transition)
const categoryCache = new GoogleBooksCache<string>();
const coverCache = new GoogleBooksCache<string | undefined>();
const pubDateCache = new GoogleBooksCache<string | undefined>();

// Request throttling configuration
const MAX_CONCURRENT_REQUESTS = 3; // Max 3 requests per second
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s
const MAX_RETRIES = 3;

/**
 * Simple promise queue to throttle concurrent requests
 */
class RequestQueue {
  private queue: Array<() => Promise<void>> = [];
  private activeCount = 0;
  private readonly maxConcurrent: number;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = async () => {
        this.activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeCount--;
          this.processNext();
        }
      };

      if (this.activeCount < this.maxConcurrent) {
        run();
      } else {
        this.queue.push(run);
      }
    });
  }

  private processNext(): void {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const requestQueue = new RequestQueue(MAX_CONCURRENT_REQUESTS);

/**
 * Fetch with retry logic and exponential backoff
 */
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimited = error?.status === 429 || error?.message?.includes('429');
      const isLastAttempt = i === retries - 1;

      if (isRateLimited && !isLastAttempt) {
        const delay = RETRY_DELAYS[i] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
        logger.warn(`Google Books rate limited, retrying in ${delay}ms (attempt ${i + 1}/${retries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}

// Supabase cache configuration
const SUPABASE_CACHE_TTL_DAYS = 30;
const CACHE_KEY_PREFIX_BOOK_INFO = 'google_books_info_'; // Unified cache
const CACHE_KEY_PREFIX_CATEGORY = 'google_books_category_';
const CACHE_KEY_PREFIX_COVER = 'google_books_cover_';
const CACHE_KEY_PREFIX_PUBDATE = 'google_books_pubdate_';

/**
 * Helper: Get cached category from Supabase
 */
const getSupabaseCachedCategory = async (isbn: string): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('fetch_cache')
      .select('*')
      .eq('cache_key', `${CACHE_KEY_PREFIX_CATEGORY}${isbn}`)
      .order('last_fetched', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // Check if cache is still valid (within TTL)
    const lastFetched = new Date(data.last_fetched);
    const now = new Date();
    const daysDiff = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff < SUPABASE_CACHE_TTL_DAYS) {
      return data.data as string;
    }

    return null;
  } catch (error) {
    logError('googleBooksApi', error, { operation: 'getSupabaseCachedCategory', isbn });
    return null;
  }
};

/**
 * Helper: Store category in Supabase cache
 */
const setSupabaseCachedCategory = async (isbn: string, category: string): Promise<void> => {
  try {
    const { data: inserted, error } = await supabase
      .from('fetch_cache')
      .insert({
        cache_key: `${CACHE_KEY_PREFIX_CATEGORY}${isbn}`,
        data: category,
        last_fetched: new Date().toISOString(),
      })
      .select('id')
      .single();

    // Prune older duplicates for this key
    if (!error && inserted?.id) {
      await supabase
        .from('fetch_cache')
        .delete()
        .eq('cache_key', `${CACHE_KEY_PREFIX_CATEGORY}${isbn}`)
        .neq('id', inserted.id);
    }
  } catch (error) {
    // Non-critical: Log but don't fail if cache write fails
    logError('googleBooksApi', error, { operation: 'setSupabaseCachedCategory', isbn });
  }
};

/**
 * Helper: Get cached cover URL from Supabase
 */
const getSupabaseCachedCover = async (isbn: string): Promise<string | undefined | null> => {
  try {
    const { data, error } = await supabase
      .from('fetch_cache')
      .select('*')
      .eq('cache_key', `${CACHE_KEY_PREFIX_COVER}${isbn}`)
      .order('last_fetched', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // Check if cache is still valid (within TTL)
    const lastFetched = new Date(data.last_fetched);
    const now = new Date();
    const daysDiff = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff < SUPABASE_CACHE_TTL_DAYS) {
      // data.data can be either a string URL or null (undefined stored as null in DB)
      // CRITICAL: Convert null back to undefined to maintain semantic meaning
      // - null from DB = "no cover found" (originally undefined)
      // - undefined returned = "cached as missing" (prevents re-fetch)
      const coverUrl = data.data;
      return coverUrl === null ? undefined : (coverUrl as string);
    }

    return null;
  } catch (error) {
    logError('googleBooksApi', error, { operation: 'getSupabaseCachedCover', isbn });
    return null;
  }
};

/**
 * Helper: Store cover URL in Supabase cache
 */
const setSupabaseCachedCover = async (isbn: string, coverUrl: string | undefined): Promise<void> => {
  try {
    const { data: inserted, error } = await supabase
      .from('fetch_cache')
      .insert({
        cache_key: `${CACHE_KEY_PREFIX_COVER}${isbn}`,
        data: coverUrl ?? null, // Store undefined as null
        last_fetched: new Date().toISOString(),
      })
      .select('id')
      .single();

    // Prune older duplicates for this key
    if (!error && inserted?.id) {
      await supabase
        .from('fetch_cache')
        .delete()
        .eq('cache_key', `${CACHE_KEY_PREFIX_COVER}${isbn}`)
        .neq('id', inserted.id);
    }
  } catch (error) {
    // Non-critical: Log but don't fail if cache write fails
    logError('googleBooksApi', error, { operation: 'setSupabaseCachedCover', isbn });
  }
};

/**
 * Helper: Get cached publication date from Supabase
 */
const getSupabaseCachedPubDate = async (isbn: string): Promise<string | undefined | null> => {
  try {
    const { data, error } = await supabase
      .from('fetch_cache')
      .select('*')
      .eq('cache_key', `${CACHE_KEY_PREFIX_PUBDATE}${isbn}`)
      .order('last_fetched', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // Check if cache is still valid (within TTL)
    const lastFetched = new Date(data.last_fetched);
    const now = new Date();
    const daysDiff = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff < SUPABASE_CACHE_TTL_DAYS) {
      const pubDate = data.data;
      return pubDate === null ? undefined : (pubDate as string);
    }

    return null;
  } catch (error) {
    logError('googleBooksApi', error, { operation: 'getSupabaseCachedPubDate', isbn });
    return null;
  }
};

/**
 * Helper: Store publication date in Supabase cache
 */
const setSupabaseCachedPubDate = async (isbn: string, pubDate: string | undefined): Promise<void> => {
  try {
    const { data: inserted, error } = await supabase
      .from('fetch_cache')
      .insert({
        cache_key: `${CACHE_KEY_PREFIX_PUBDATE}${isbn}`,
        data: pubDate ?? null, // Store undefined as null
        last_fetched: new Date().toISOString(),
      })
      .select('id')
      .single();

    // Prune older duplicates for this key
    if (!error && inserted?.id) {
      await supabase
        .from('fetch_cache')
        .delete()
        .eq('cache_key', `${CACHE_KEY_PREFIX_PUBDATE}${isbn}`)
        .neq('id', inserted.id);
    }
  } catch (error) {
    // Non-critical: Log but don't fail if cache write fails
    logError('googleBooksApi', error, { operation: 'setSupabaseCachedPubDate', isbn });
  }
};

/**
 * Helper: Get cached book info from Supabase (unified cache)
 */
const getSupabaseCachedBookInfo = async (isbn: string): Promise<CachedBookInfo | null> => {
  try {
    const { data, error } = await supabase
      .from('fetch_cache')
      .select('*')
      .eq('cache_key', `${CACHE_KEY_PREFIX_BOOK_INFO}${isbn}`)
      .order('last_fetched', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    // Check if cache is still valid (within TTL)
    const lastFetched = new Date(data.last_fetched);
    const now = new Date();
    const daysDiff = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff < SUPABASE_CACHE_TTL_DAYS) {
      return data.data as CachedBookInfo;
    }

    return null;
  } catch (error) {
    logError('googleBooksApi', error, { operation: 'getSupabaseCachedBookInfo', isbn });
    return null;
  }
};

/**
 * Helper: Store book info in Supabase cache (unified cache)
 */
const setSupabaseCachedBookInfo = async (isbn: string, bookInfo: CachedBookInfo): Promise<void> => {
  try {
    const { data: inserted, error } = await supabase
      .from('fetch_cache')
      .insert({
        cache_key: `${CACHE_KEY_PREFIX_BOOK_INFO}${isbn}`,
        data: bookInfo,
        last_fetched: new Date().toISOString(),
      })
      .select('id')
      .single();

    // Prune older duplicates for this key
    if (!error && inserted?.id) {
      await supabase
        .from('fetch_cache')
        .delete()
        .eq('cache_key', `${CACHE_KEY_PREFIX_BOOK_INFO}${isbn}`)
        .neq('id', inserted.id);
    }
  } catch (error) {
    // Non-critical: Log but don't fail if cache write fails
    logError('googleBooksApi', error, { operation: 'setSupabaseCachedBookInfo', isbn });
  }
};

/**
 * Fetch full book information with three-tier caching (UNIFIED CACHE)
 *
 * This is the primary function for fetching book metadata. It caches the entire
 * volumeInfo object, which can then be used by other functions to extract specific
 * fields (cover, category, pubdate, description, pageCount, etc.)
 *
 * Cache lookup order:
 * 1. In-memory cache (30 min TTL) - Fastest, session-scoped
 * 2. Supabase cache (30 day TTL) - Persistent, shared across users
 * 3. Google Books API - Fallback with throttling and retry
 *
 * @param isbn - ISBN-10 or ISBN-13 identifier
 * @returns Full book info object or object with _notFound flag if not found
 */
export const fetchCachedBookInfo = async (isbn: string): Promise<CachedBookInfo> => {
  // Layer 1: Check in-memory cache (fastest)
  const memCached = bookInfoCache.get(isbn);
  if (memCached) {
    return memCached;
  }

  // Layer 2: Check Supabase cache (persistent)
  const dbCached = await getSupabaseCachedBookInfo(isbn);
  if (dbCached) {
    // Populate in-memory cache for subsequent requests in this session
    bookInfoCache.set(isbn, dbCached);
    return dbCached;
  }

  // Layer 3: Fetch from Google Books API with throttling and retry
  try {
    const bookInfo = await requestQueue.add(async () => {
      return await fetchWithRetry(async () => {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);

        if (!response.ok) {
          throw new FetchError(
            ErrorCode.GOOGLE_BOOKS_API_ERROR,
            { isbn, status: response.status, statusText: response.statusText }
          );
        }

        const data: GoogleBooksResponse = await response.json();

        if (data.items && data.items.length > 0) {
          const volumeInfo = data.items[0].volumeInfo;

          // Convert imageLinks URLs from http:// to https:// to avoid mixed content warnings
          const imageLinks = volumeInfo.imageLinks ? {
            thumbnail: volumeInfo.imageLinks.thumbnail?.replace(/^http:/, 'https:'),
            small: volumeInfo.imageLinks.small?.replace(/^http:/, 'https:'),
            medium: volumeInfo.imageLinks.medium?.replace(/^http:/, 'https:'),
            large: volumeInfo.imageLinks.large?.replace(/^http:/, 'https:'),
          } : undefined;

          return {
            title: volumeInfo.title,
            authors: volumeInfo.authors,
            publisher: volumeInfo.publisher,
            publishedDate: volumeInfo.publishedDate,
            description: volumeInfo.description,
            pageCount: volumeInfo.pageCount,
            categories: volumeInfo.categories,
            imageLinks,
            industryIdentifiers: volumeInfo.industryIdentifiers,
          } as CachedBookInfo;
        }

        // Book not found - return marker object
        return { _notFound: true } as CachedBookInfo;
      });
    });

    // Store in both cache layers
    bookInfoCache.set(isbn, bookInfo);
    await setSupabaseCachedBookInfo(isbn, bookInfo);

    return bookInfo;
  } catch (error) {
    logger.error('Failed to fetch book info after retries', { isbn, error });

    // Cache "not found" to avoid repeated failed requests
    const notFoundInfo: CachedBookInfo = { _notFound: true };
    bookInfoCache.set(isbn, notFoundInfo);
    await setSupabaseCachedBookInfo(isbn, notFoundInfo);

    return notFoundInfo;
  }
};

/**
 * Fetch category for a single ISBN using the unified book info cache
 *
 * Uses the unified cache to avoid duplicate API calls when multiple
 * fields are needed for the same book (cover, category, pubdate, etc.)
 *
 * @param isbn - ISBN-10 or ISBN-13 identifier
 * @returns Book category/genre string (e.g., "Fiction", "Biography") or "Unknown"
 *
 * @example
 * ```typescript
 * const category = await fetchGoogleBooksCategory('9781234567890');
 * console.log(category); // "Fiction"
 * ```
 */
export const fetchGoogleBooksCategory = async (isbn: string): Promise<string> => {
  // Use unified cache - this will check in-memory, then Supabase, then API
  const bookInfo = await fetchCachedBookInfo(isbn);

  if (bookInfo._notFound) {
    return 'Unknown';
  }

  return bookInfo.categories?.[0] || 'Unknown';
};

/**
 * Fetch categories for multiple ISBNs in parallel with throttling
 *
 * Efficiently fetches genre information for multiple books using:
 * - Parallel processing (10 concurrent requests by default)
 * - Automatic cache lookups (skips already-cached ISBNs)
 * - Promise.allSettled for graceful error handling
 * - Batching to avoid overwhelming the API
 *
 * @param isbns - Array of ISBN-10 or ISBN-13 identifiers
 * @param batchSize - Number of concurrent requests (default: 10, max recommended: 20)
 * @returns Record mapping each ISBN to its category/genre string
 *
 * @example
 * ```typescript
 * const isbns = ['9781234567890', '9780987654321', '9781111111111'];
 * const categories = await fetchGoogleBooksCategoriesBatch(isbns);
 * // {
 * //   '9781234567890': 'Fiction',
 * //   '9780987654321': 'Biography',
 * //   '9781111111111': 'Unknown'
 * // }
 * ```
 */
export const fetchGoogleBooksCategoriesBatch = async (
  isbns: string[],
  batchSize: number = 10
): Promise<Record<string, string>> => {
  const results: Record<string, string> = {};

  // Filter out ISBNs that are already cached
  const uncachedIsbns: string[] = [];
  for (const isbn of isbns) {
    const cached = categoryCache.get(isbn);
    if (cached) {
      results[isbn] = cached;
    } else {
      uncachedIsbns.push(isbn);
    }
  }

  if (uncachedIsbns.length === 0) {
    return results;
  }

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < uncachedIsbns.length; i += batchSize) {
    const batch = uncachedIsbns.slice(i, i + batchSize);
    const promises = batch.map(isbn => fetchGoogleBooksCategory(isbn));
    const categories = await Promise.allSettled(promises);

    categories.forEach((result, index) => {
      const isbn = batch[index];
      if (result.status === 'fulfilled') {
        results[isbn] = result.value;
      } else {
        logError('googleBooksApi', result.reason, { operation: 'fetchGoogleBooksCategoriesBatch', isbn });
        results[isbn] = 'Unknown';
      }
    });
  }

  return results;
};

/**
 * Fetch full book information from Google Books API
 *
 * Retrieves complete metadata for a book including title, authors, publisher,
 * description, page count, categories, and image links.
 * This function does NOT use caching - it always fetches fresh data.
 *
 * @param isbn - ISBN-10 or ISBN-13 identifier
 * @returns Book metadata object or null if not found
 *
 * @example
 * ```typescript
 * const info = await fetchGoogleBooksInfo('9781234567890');
 * if (info) {
 *   console.log(info.title);        // "The Great Gatsby"
 *   console.log(info.authors);      // ["F. Scott Fitzgerald"]
 *   console.log(info.categories);   // ["Fiction"]
 *   console.log(info.pageCount);    // 180
 * }
 * ```
 */
export const fetchGoogleBooksInfo = async (isbn: string): Promise<GoogleBooksVolume['volumeInfo'] | null> => {
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);

    if (!response.ok) {
      throw new FetchError(
        ErrorCode.GOOGLE_BOOKS_API_ERROR,
        { isbn, status: response.status, statusText: response.statusText }
      );
    }

    const data: GoogleBooksResponse = await response.json();

    if (data.items && data.items.length > 0) {
      return data.items[0].volumeInfo;
    }

    return null;
  } catch (error) {
    logError('googleBooksApi', error, { operation: 'fetchGoogleBooksInfo', isbn });
    return null;
  }
};

/**
 * Fetch a single cover URL using the unified book info cache
 *
 * Uses the unified cache to avoid duplicate API calls when multiple
 * fields are needed for the same book (cover, category, pubdate, etc.)
 *
 * @param isbn - ISBN-10 or ISBN-13 identifier
 * @returns Cover URL or undefined if not found
 */
async function fetchSingleCover(isbn: string): Promise<string | undefined> {
  // Use unified cache - this will check in-memory, then Supabase, then API
  const bookInfo = await fetchCachedBookInfo(isbn);

  if (bookInfo._notFound) {
    return undefined;
  }

  const { imageLinks } = bookInfo;
  // Get best available image (prefer larger)
  const rawUrl = imageLinks?.large ||
         imageLinks?.medium ||
         imageLinks?.small ||
         imageLinks?.thumbnail;

  // Convert http:// to https:// to avoid mixed content warnings
  return rawUrl ? rawUrl.replace(/^http:/, 'https:') : undefined;
}

/**
 * Fetch cover URLs for multiple ISBNs with three-tier caching
 *
 * Efficiently fetches cover images for multiple books using:
 * - Three-tier caching (in-memory, Supabase, Google Books API)
 * - Request throttling (max 3 concurrent requests)
 * - Exponential backoff retry on rate limits (429)
 * - Graceful error handling with fallbacks
 *
 * Most requests will be served from cache, drastically reducing Google Books API calls.
 *
 * @param isbns - Array of ISBN-10 or ISBN-13 identifiers
 * @returns Record mapping each ISBN to its cover URL (or undefined if not found)
 *
 * @example
 * ```typescript
 * const covers = await fetchGoogleBooksCoversBatch(['9781234567890', '9780987654321']);
 * // First call: fetches from API with throttling
 * // Subsequent calls: served from cache
 * ```
 */
export const fetchGoogleBooksCoversBatch = async (
  isbns: string[]
): Promise<Record<string, string | undefined>> => {
  const startTime = Date.now();
  const results: Record<string, string | undefined> = {};

  // Track cache performance
  let cacheHits = 0;
  let cacheMisses = 0;

  // Fetch all covers (cache lookups are fast, API calls are throttled)
  const promises = isbns.map(async (isbn) => {
    // Check if in memory cache before fetching
    const memCached = coverCache.get(isbn);
    if (memCached !== null) {
      cacheHits++;
    } else {
      cacheMisses++;
    }

    const coverUrl = await fetchSingleCover(isbn);
    results[isbn] = coverUrl;
  });

  await Promise.allSettled(promises);

  const elapsed = Date.now() - startTime;
  logger.info('Fetched cover batch', {
    totalIsbns: isbns.length,
    cacheHits,
    cacheMisses,
    cacheHitRate: `${Math.round((cacheHits / isbns.length) * 100)}%`,
    elapsedMs: elapsed,
  });

  return results;
};

/**
 * Fetch publication date for a single ISBN using the unified book info cache
 *
 * Uses the unified cache to avoid duplicate API calls when multiple
 * fields are needed for the same book (cover, category, pubdate, etc.)
 *
 * @param isbn - ISBN-10 or ISBN-13 identifier
 * @returns Publication date string (e.g., "2024-05-15", "2024") or undefined if not found
 */
async function fetchSinglePubDate(isbn: string): Promise<string | undefined> {
  // Use unified cache - this will check in-memory, then Supabase, then API
  const bookInfo = await fetchCachedBookInfo(isbn);

  if (bookInfo._notFound) {
    return undefined;
  }

  return bookInfo.publishedDate;
}

/**
 * Fetch publication dates for multiple ISBNs with three-tier caching
 *
 * Efficiently fetches publication dates for multiple books using:
 * - Three-tier caching (in-memory, Supabase, Google Books API)
 * - Request throttling (max 3 concurrent requests)
 * - Exponential backoff retry on rate limits (429)
 * - Graceful error handling with fallbacks
 *
 * @param isbns - Array of ISBN-10 or ISBN-13 identifiers
 * @returns Record mapping each ISBN to its publication date (or undefined if not found)
 *
 * @example
 * ```typescript
 * const pubDates = await fetchGoogleBooksPubDatesBatch(['9781234567890', '9780987654321']);
 * // { '9781234567890': '2024-05-15', '9780987654321': '2023' }
 * ```
 */
export const fetchGoogleBooksPubDatesBatch = async (
  isbns: string[]
): Promise<Record<string, string | undefined>> => {
  const startTime = Date.now();
  const results: Record<string, string | undefined> = {};

  // Track cache performance
  let cacheHits = 0;
  let cacheMisses = 0;

  // Fetch all pub dates (cache lookups are fast, API calls are throttled)
  const promises = isbns.map(async (isbn) => {
    // Check if in memory cache before fetching
    const memCached = pubDateCache.get(isbn);
    if (memCached !== null) {
      cacheHits++;
    } else {
      cacheMisses++;
    }

    const pubDate = await fetchSinglePubDate(isbn);
    results[isbn] = pubDate;
  });

  await Promise.allSettled(promises);

  const elapsed = Date.now() - startTime;
  logger.info('Fetched publication date batch', {
    totalIsbns: isbns.length,
    cacheHits,
    cacheMisses,
    cacheHitRate: `${Math.round((cacheHits / isbns.length) * 100)}%`,
    elapsedMs: elapsed,
  });

  return results;
};

/**
 * Clear the in-memory category cache
 *
 * Clears only the in-memory cache layer (30-minute TTL).
 * Supabase persistent cache (30-day TTL) remains unchanged.
 * Useful for testing or forcing fresh API requests.
 *
 * @example
 * ```typescript
 * clearGoogleBooksCache();
 * // Next fetchGoogleBooksCategory call will check Supabase, then API
 * ```
 */
export const clearGoogleBooksCache = (): void => {
  categoryCache.clear();
};

/**
 * Clear the in-memory cover cache
 *
 * Clears only the in-memory cover cache layer (30-minute TTL).
 * Supabase persistent cache (30-day TTL) remains unchanged.
 * Useful for testing or forcing fresh API requests.
 *
 * @example
 * ```typescript
 * clearGoogleBooksCoverCache();
 * // Next fetchGoogleBooksCoversBatch call will check Supabase, then API
 * ```
 */
export const clearGoogleBooksCoverCache = (): void => {
  coverCache.clear();
};

/**
 * Clear the in-memory publication date cache
 *
 * Clears only the in-memory pub date cache layer (30-minute TTL).
 * Supabase persistent cache (30-day TTL) remains unchanged.
 * Useful for testing or forcing fresh API requests.
 *
 * @example
 * ```typescript
 * clearGoogleBooksPubDateCache();
 * // Next fetchGoogleBooksPubDatesBatch call will check Supabase, then API
 * ```
 */
export const clearGoogleBooksPubDateCache = (): void => {
  pubDateCache.clear();
};

/**
 * Clear the in-memory unified book info cache
 *
 * Clears only the in-memory book info cache layer (30-minute TTL).
 * Supabase persistent cache (30-day TTL) remains unchanged.
 * Useful for testing or forcing fresh API requests.
 *
 * @example
 * ```typescript
 * clearGoogleBooksInfoCache();
 * // Next fetchCachedBookInfo call will check Supabase, then API
 * ```
 */
export const clearGoogleBooksInfoCache = (): void => {
  bookInfoCache.clear();
};
