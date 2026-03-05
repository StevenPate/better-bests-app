/**
 * Tests for Google Books API Service with two-tier caching
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchGoogleBooksCategory, fetchGoogleBooksCategoriesBatch, fetchCachedBookInfo, fetchGoogleBooksCoversBatch, fetchGoogleBooksPubDatesBatch, clearGoogleBooksCache, clearGoogleBooksInfoCache, clearGoogleBooksCoverCache, clearGoogleBooksPubDateCache } from './googleBooksApi';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
            })),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'test-id' }, error: null })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          neq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    })),
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('fetchGoogleBooksCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGoogleBooksCache();
    clearGoogleBooksInfoCache();
  });

  it('should fetch category from Google Books API on cache miss', async () => {
    const mockResponse = {
      items: [
        {
          volumeInfo: {
            categories: ['Fiction'],
          },
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchGoogleBooksCategory('9780743273565');

    expect(result).toBe('Fiction');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/books/v1/volumes?q=isbn:9780743273565'
    );
  });

  it('should return "Unknown" when no book data is found', async () => {
    const mockResponse = { items: [] };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchGoogleBooksCategory('9999999999999');

    expect(result).toBe('Unknown');
  });

  it('should use in-memory cache on second request', async () => {
    const mockResponse = {
      items: [
        {
          volumeInfo: {
            categories: ['Science Fiction'],
          },
        },
      ],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // First call - should hit API
    const result1 = await fetchGoogleBooksCategory('9780451524935');
    expect(result1).toBe('Science Fiction');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call - should use in-memory cache
    const result2 = await fetchGoogleBooksCategory('9780451524935');
    expect(result2).toBe('Science Fiction');
    expect(global.fetch).toHaveBeenCalledTimes(1); // No additional API call
  });

  it('should handle API errors gracefully', async () => {
    (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

    const result = await fetchGoogleBooksCategory('9780000000000');

    expect(result).toBe('Unknown');
  });
});

describe('fetchGoogleBooksCategoriesBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGoogleBooksCache();
    clearGoogleBooksInfoCache();
  });

  it('should fetch multiple ISBNs in parallel', async () => {
    const mockResponse1 = {
      items: [{ volumeInfo: { categories: ['Fiction'] } }],
    };
    const mockResponse2 = {
      items: [{ volumeInfo: { categories: ['History'] } }],
    };

    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => mockResponse1 })
      .mockResolvedValueOnce({ ok: true, json: async () => mockResponse2 });

    const result = await fetchGoogleBooksCategoriesBatch(
      ['9780743273565', '9780140449136'],
      2
    );

    expect(result).toEqual({
      '9780743273565': 'Fiction',
      '9780140449136': 'History',
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should respect batch size', async () => {
    const isbns = ['isbn1', 'isbn2', 'isbn3', 'isbn4', 'isbn5'];

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ volumeInfo: { categories: ['Test'] } }] }),
    });

    await fetchGoogleBooksCategoriesBatch(isbns, 2);

    // With batch size 2, should process in 3 batches (2, 2, 1)
    // But all 5 fetch calls should eventually happen
    expect(global.fetch).toHaveBeenCalledTimes(5);
  });

  it('should handle partial failures in batch', async () => {
    (global.fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ volumeInfo: { categories: ['Fiction'] } }] }) })
      .mockRejectedValueOnce(new Error('API error'));

    const result = await fetchGoogleBooksCategoriesBatch(['isbn1', 'isbn2'], 2);

    expect(result.isbn1).toBe('Fiction');
    expect(result.isbn2).toBe('Unknown');
  });

  it('should use cached results from previous calls', async () => {
    const mockResponse = {
      items: [{ volumeInfo: { categories: ['Fiction'] } }],
    };

    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => mockResponse });

    // First batch
    await fetchGoogleBooksCategoriesBatch(['isbn1', 'isbn2'], 2);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    vi.clearAllMocks();

    // Second batch with some overlap - should only fetch new ISBNs
    await fetchGoogleBooksCategoriesBatch(['isbn2', 'isbn3'], 2);
    expect(global.fetch).toHaveBeenCalledTimes(1); // Only isbn3 fetched
  });
});

describe('retry behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGoogleBooksCache();
    clearGoogleBooksInfoCache();
  });

  it('should retry on 429 rate limit and succeed', async () => {
    const rateLimitError: any = new Error('429 Too Many Requests');
    rateLimitError.status = 429;

    const mockResponse = {
      items: [{ volumeInfo: { categories: ['Fiction'] } }],
    };

    (global.fetch as any)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ ok: true, json: async () => mockResponse });

    const result = await fetchGoogleBooksCategory('9780743273565');
    expect(result).toBe('Fiction');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should return Unknown after exhausting retries on persistent 429', async () => {
    const rateLimitError: any = new Error('429 Too Many Requests');
    rateLimitError.status = 429;

    (global.fetch as any).mockRejectedValue(rateLimitError);

    const result = await fetchGoogleBooksCategory('9780743273565');
    expect(result).toBe('Unknown');
  });
});

describe('HTTP error responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGoogleBooksCache();
    clearGoogleBooksInfoCache();
  });

  it('should handle HTTP 500 from Google Books API', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await fetchGoogleBooksCategory('9780743273565');
    expect(result).toBe('Unknown');
  });

  it('should handle response with no items array', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const result = await fetchGoogleBooksCategory('9780743273565');
    expect(result).toBe('Unknown');
  });
});

describe('fetchCachedBookInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGoogleBooksCache();
    clearGoogleBooksInfoCache();
  });

  it('should return data from in-memory cache on second call', async () => {
    const mockResponse = {
      items: [{
        volumeInfo: {
          title: 'Test Book',
          categories: ['Fiction'],
          imageLinks: { thumbnail: 'http://example.com/thumb.jpg' },
        },
      }],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // First call: API
    const result1 = await fetchCachedBookInfo('9780743273565');
    expect(result1).toBeDefined();
    expect(result1?.title).toBe('Test Book');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call: in-memory cache (no API call)
    const result2 = await fetchCachedBookInfo('9780743273565');
    expect(result2?.title).toBe('Test Book');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should return _notFound for ISBN with no Google Books results', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const result = await fetchCachedBookInfo('9999999999999');
    expect(result._notFound).toBe(true);
  });

  it('should convert http image URLs to https', async () => {
    const mockResponse = {
      items: [{
        volumeInfo: {
          imageLinks: { thumbnail: 'http://books.google.com/thumb.jpg' },
        },
      }],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchCachedBookInfo('9780743273565');
    expect(result?.imageLinks?.thumbnail).toMatch(/^https:/);
  });
});

describe('fetchGoogleBooksCoversBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGoogleBooksCache();
    clearGoogleBooksInfoCache();
    clearGoogleBooksCoverCache();
  });

  it('should return cover URLs for valid ISBNs', async () => {
    const mockResponse = {
      items: [{
        volumeInfo: {
          imageLinks: { thumbnail: 'http://books.google.com/thumb.jpg' },
        },
      }],
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchGoogleBooksCoversBatch(['9780743273565']);
    expect(result['9780743273565']).toBeDefined();
    expect(result['9780743273565']).toMatch(/^https:/);
  });

  it('should return undefined for ISBNs with no cover', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ volumeInfo: {} }] }),
    });

    const result = await fetchGoogleBooksCoversBatch(['9780743273565']);
    expect(result['9780743273565']).toBeUndefined();
  });
});

describe('fetchGoogleBooksPubDatesBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGoogleBooksCache();
    clearGoogleBooksInfoCache();
    clearGoogleBooksPubDateCache();
  });

  it('should return publication dates for valid ISBNs', async () => {
    const mockResponse = {
      items: [{
        volumeInfo: { publishedDate: '2024-01-15' },
      }],
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchGoogleBooksPubDatesBatch(['9780743273565']);
    expect(result['9780743273565']).toBe('2024-01-15');
  });

  it('should return undefined for ISBNs with no pub date', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ volumeInfo: {} }] }),
    });

    const result = await fetchGoogleBooksPubDatesBatch(['9780743273565']);
    expect(result['9780743273565']).toBeUndefined();
  });
});
