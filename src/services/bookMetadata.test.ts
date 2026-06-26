/**
 * Tests for fetchBookMetadata — the 3-tier fallback chain used by BookDetail.
 *
 * Tier 1: Google Books (via fetchCachedBookInfo)
 * Tier 2: distinct_books view (derived from regional_bestsellers)
 * Tier 3: scrapedListCache (this week's client-scraped list per region)
 *
 * Each tier is mocked individually so the test focuses on chain wiring, not
 * the tiers themselves (each has its own dedicated tests).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchBookMetadata } from './bookMetadata';

const { mockFetchCachedBookInfo, mockDistinctBooksSingle, mockGetScrapedBookInfo } = vi.hoisted(() => ({
  mockFetchCachedBookInfo: vi.fn(),
  mockDistinctBooksSingle: vi.fn(),
  mockGetScrapedBookInfo: vi.fn(),
}));

vi.mock('./googleBooksApi', () => ({
  fetchCachedBookInfo: mockFetchCachedBookInfo,
}));

vi.mock('./scrapedListCache', () => ({
  getScrapedBookInfo: mockGetScrapedBookInfo,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockDistinctBooksSingle,
        })),
      })),
    })),
  },
}));

describe('fetchBookMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns Google Books data when tier 1 returns a title', async () => {
    mockFetchCachedBookInfo.mockResolvedValueOnce({
      title: 'The Great Gatsby',
      authors: ['F. Scott Fitzgerald'],
      publisher: 'Scribner',
      pageCount: 180,
    });

    const result = await fetchBookMetadata('9780743273565', 'PNBA');

    expect(result?.title).toBe('The Great Gatsby');
    expect(result?.author).toBe('F. Scott Fitzgerald');
    expect(result?.pageCount).toBe(180);
    expect(mockDistinctBooksSingle).not.toHaveBeenCalled();
    expect(mockGetScrapedBookInfo).not.toHaveBeenCalled();
  });

  it('falls back to distinct_books when Google Books returns _notFound', async () => {
    mockFetchCachedBookInfo.mockResolvedValueOnce({ _notFound: true });
    mockDistinctBooksSingle.mockResolvedValueOnce({
      data: { title: 'Db Book', author: 'Db Author', publisher: 'Db Pub' },
      error: null,
    });

    const result = await fetchBookMetadata('9780000000001', 'PNBA');

    expect(result?.title).toBe('Db Book');
    expect(result?.author).toBe('Db Author');
    expect(result?.publisher).toBe('Db Pub');
    expect(mockGetScrapedBookInfo).not.toHaveBeenCalled();
  });

  it('falls back to scraped list cache when Google Books and distinct_books both miss', async () => {
    mockFetchCachedBookInfo.mockResolvedValueOnce({ _notFound: true });
    mockDistinctBooksSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    mockGetScrapedBookInfo.mockResolvedValueOnce({
      title: 'Our Infinite Fates: A Novel',
      author: 'Laura Steven',
      publisher: 'Wednesday Books',
    });

    const result = await fetchBookMetadata('9781250333902', 'PNBA');

    expect(result?.title).toBe('Our Infinite Fates: A Novel');
    expect(result?.author).toBe('Laura Steven');
    expect(result?.publisher).toBe('Wednesday Books');
    expect(mockGetScrapedBookInfo).toHaveBeenCalledWith('9781250333902', 'PNBA');
  });

  it('returns null when all three tiers miss', async () => {
    mockFetchCachedBookInfo.mockResolvedValueOnce({ _notFound: true });
    mockDistinctBooksSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    mockGetScrapedBookInfo.mockResolvedValueOnce(null);

    const result = await fetchBookMetadata('9999999999998', 'PNBA');

    expect(result).toBeNull();
  });

  it('treats Google Books hit without title as a miss and continues falling back', async () => {
    // Real-world case: API returned a result but the metadata is empty
    mockFetchCachedBookInfo.mockResolvedValueOnce({ authors: ['Some Author'] }); // no title
    mockDistinctBooksSingle.mockResolvedValueOnce({
      data: { title: 'Found in DB', author: 'Db Author', publisher: null },
      error: null,
    });

    const result = await fetchBookMetadata('9780000000002', 'PNBA');

    expect(result?.title).toBe('Found in DB');
  });
});
