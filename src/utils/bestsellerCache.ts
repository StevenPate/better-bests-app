import { supabase } from '@/integrations/supabase/client';
import { DateUtils } from './dateUtils';
import { logger } from '@/lib/logger';
import { FetchError, ErrorCode, logError } from '@/lib/errors';

export async function getCachedData(cacheKey: string): Promise<Record<string, unknown> | null> {
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

export async function setCachedData(cacheKey: string, data: unknown): Promise<void> {
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

export function isCurrentWeek(dateStr: string): boolean {
  const cachedDate = new Date(dateStr);
  const mostRecentWednesday = DateUtils.getMostRecentWednesday();
  return cachedDate.toDateString() === mostRecentWednesday.toDateString();
}

export async function shouldFetchNewData(
  region: string = 'PNBA',
  getCachedDataFn: (key: string) => Promise<Record<string, unknown> | null> = getCachedData
): Promise<boolean> {
  const cacheKey = `${region}_current_bestseller_list_v2`;
  const cachedData = await getCachedDataFn(cacheKey);

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

export function isRecentCache(lastFetched: string, days: number): boolean {
  const cachedDate = new Date(lastFetched);
  const now = new Date();
  const daysDiff = (now.getTime() - cachedDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysDiff < days;
}
