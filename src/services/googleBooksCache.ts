import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { FetchError, ErrorCode, logError } from '@/lib/errors';
import type { CachedBookInfo } from './googleBooksApi';

// In-memory cache for Google Books data with TTL
export class GoogleBooksCache<T> {
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
export const bookInfoCache = new GoogleBooksCache<CachedBookInfo>();

// Legacy individual caches (kept for backward compatibility during transition)
export const categoryCache = new GoogleBooksCache<string>();
export const coverCache = new GoogleBooksCache<string | undefined>();
export const pubDateCache = new GoogleBooksCache<string | undefined>();

// Request throttling configuration
const MAX_CONCURRENT_REQUESTS = 3;
const RETRY_DELAYS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

/**
 * Simple promise queue to throttle concurrent requests
 */
export class RequestQueue {
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

export const requestQueue = new RequestQueue(MAX_CONCURRENT_REQUESTS);

/**
 * Fetch with retry logic and exponential backoff
 */
export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      const isRateLimited = err?.status === 429 || err?.message?.includes('429');
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
const CACHE_KEY_PREFIX_BOOK_INFO = 'google_books_info_';

/**
 * Helper: Get cached book info from Supabase (unified cache)
 */
export const getSupabaseCachedBookInfo = async (isbn: string): Promise<CachedBookInfo | null> => {
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
export const setSupabaseCachedBookInfo = async (isbn: string, bookInfo: CachedBookInfo): Promise<void> => {
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
