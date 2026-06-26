/**
 * Tests for scrapedListCache helper
 *
 * Looks up book metadata from the {REGION}_current_bestseller_list_v2
 * fetch_cache entry that the client populates when the user views the list page.
 * Used as a fallback in BookDetail when Google Books and distinct_books both miss.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getScrapedBookInfo } from './scrapedListCache';

const { mockMaybeSingle } = vi.hoisted(() => ({
  mockMaybeSingle: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: mockMaybeSingle,
            })),
          })),
        })),
      })),
    })),
  },
}));

function cacheRow(books: Array<{ isbn: string; title: string; author: string; publisher?: string }>) {
  return {
    data: {
      data: {
        current: {
          categories: [{ name: 'TEEN', books }],
        },
      },
    },
    error: null,
  };
}

describe('getScrapedBookInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns title/author/publisher when the ISBN is present in the cached current list', async () => {
    mockMaybeSingle.mockResolvedValueOnce(cacheRow([
      {
        isbn: '9781250333902',
        title: 'Our Infinite Fates: A Novel',
        author: 'Laura Steven',
        publisher: 'Wednesday Books',
      },
    ]));

    const result = await getScrapedBookInfo('9781250333902', 'PNBA');

    expect(result).toEqual({
      title: 'Our Infinite Fates: A Novel',
      author: 'Laura Steven',
      publisher: 'Wednesday Books',
    });
  });

  it('returns null when the ISBN is not in any category', async () => {
    mockMaybeSingle.mockResolvedValueOnce(cacheRow([
      { isbn: '9999999999999', title: 'Other Book', author: 'Someone' },
    ]));

    const result = await getScrapedBookInfo('9781250333902', 'PNBA');

    expect(result).toBeNull();
  });

  it('returns null when there is no cache row for the region', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const result = await getScrapedBookInfo('9781250333902', 'PNBA');

    expect(result).toBeNull();
  });
});
