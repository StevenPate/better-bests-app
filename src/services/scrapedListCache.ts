import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

export interface ScrapedBookInfo {
  title: string;
  author: string;
  publisher?: string;
}

interface CachedBook {
  isbn?: string;
  title?: string;
  author?: string;
  publisher?: string;
}

interface CachedCategory {
  books?: CachedBook[];
}

interface CachedListEnvelope {
  current?: { categories?: CachedCategory[] };
}

/**
 * Look up book metadata from the most recent scraped current bestseller list
 * for the given region. Acts as a fallback for BookDetail when Google Books
 * and distinct_books both miss — typically for books that just appeared on
 * the list this week and haven't propagated to regional_bestsellers yet.
 */
export const getScrapedBookInfo = async (
  isbn: string,
  region: string
): Promise<ScrapedBookInfo | null> => {
  try {
    const cacheKey = `${region}_current_bestseller_list_v2`;
    const { data, error } = await supabase
      .from('fetch_cache')
      .select('data')
      .eq('cache_key', cacheKey)
      .order('last_fetched', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const envelope = (data as { data?: CachedListEnvelope }).data;
    const categories = envelope?.current?.categories ?? [];

    for (const category of categories) {
      for (const book of category.books ?? []) {
        if (book.isbn === isbn && book.title && book.author) {
          return {
            title: book.title,
            author: book.author,
            publisher: book.publisher,
          };
        }
      }
    }

    return null;
  } catch (err) {
    logger.error('getScrapedBookInfo failed', { isbn, region, err });
    return null;
  }
};
