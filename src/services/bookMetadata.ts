import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { fetchCachedBookInfo } from './googleBooksApi';
import { getScrapedBookInfo } from './scrapedListCache';

export interface BookMetadata {
  title: string;
  author: string;
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
  industryIdentifiers?: Array<{ type: string; identifier: string }>;
}

/**
 * Three-tier fallback chain for book metadata used by the book detail page.
 *
 *   1. Google Books (cached) — richest data; produces nothing for new/obscure books
 *   2. distinct_books view — derived from regional_bestsellers; missing this week's
 *      new arrivals until the Wednesday cron populates them
 *   3. scrapedListCache — the {region}_current_bestseller_list_v2 entry the list
 *      page populated as the user browsed; the freshest available source
 */
export const fetchBookMetadata = async (
  isbn: string,
  region: string
): Promise<BookMetadata | null> => {
  try {
    const cachedInfo = await fetchCachedBookInfo(isbn);
    if (!cachedInfo._notFound && cachedInfo.title) {
      return {
        title: cachedInfo.title,
        author: cachedInfo.authors?.join(', ') || 'Unknown Author',
        publisher: cachedInfo.publisher,
        publishedDate: cachedInfo.publishedDate,
        description: cachedInfo.description,
        pageCount: cachedInfo.pageCount,
        categories: cachedInfo.categories,
        imageLinks: cachedInfo.imageLinks,
        industryIdentifiers: cachedInfo.industryIdentifiers,
      };
    }

    const { data: dbBook, error: dbError } = await supabase
      .from('distinct_books')
      .select('title, author, publisher')
      .eq('isbn', isbn)
      .single();

    if (!dbError && dbBook?.title) {
      return {
        title: dbBook.title,
        author: dbBook.author || 'Unknown Author',
        publisher: dbBook.publisher ?? undefined,
      };
    }

    const scraped = await getScrapedBookInfo(isbn, region);
    if (scraped) {
      return {
        title: scraped.title,
        author: scraped.author,
        publisher: scraped.publisher,
      };
    }

    return null;
  } catch (error) {
    logger.error('fetchBookMetadata failed', { isbn, region, error });
    return null;
  }
};
