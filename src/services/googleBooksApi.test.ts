/**
 * Tests for Google Books API Service with two-tier caching
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchGoogleBooksCategory, fetchGoogleBooksCategoriesBatch, clearGoogleBooksCache } from './googleBooksApi';

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
