import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { BestsellerParser } from './bestsellerParser';
import { BestsellerList, BestsellerCategory } from '@/types/bestseller';

const supabaseClientMock = vi.hoisted(() => {
  const createSelectChain = () => {
    const maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const single = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const limit = vi.fn(() => ({ maybeSingle, single }));
    const order = vi.fn(() => ({ limit }));
    const eq = vi.fn(() => ({ order, single }));
    const inFn = vi.fn(() => Promise.resolve({ data: [], error: null }));

    return { eq, in: inFn };
  };

  return {
    from: vi.fn(() => ({
      select: vi.fn(() => createSelectChain()),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 1 }, error: null })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          neq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 1 }, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
  } as any;
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: supabaseClientMock,
}));

// Mock DateUtils
vi.mock('./dateUtils', () => ({
  DateUtils: {
    getMostRecentWednesday: vi.fn(() => new Date('2024-01-10T00:00:00')), // Wednesday
    getPreviousWednesday: vi.fn(() => new Date('2024-01-03T00:00:00')), // Previous Wednesday
    formatAsYYMMDD: vi.fn((date: Date) => {
      const year = date.getFullYear().toString().slice(-2);
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}${month}${day}`;
    }),
  },
}));

describe('BestsellerParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabaseClientMock.rpc as Mock).mockResolvedValue({ data: [], error: null });
    BestsellerParser.__resetCachesForTests();
  });

  describe('parseList', () => {
    it('should parse a simple PNBA bestseller list', () => {
      const sampleData = `
PACIFIC NORTHWEST BOOKSELLERS ASSOCIATION BESTSELLERS
for the week ended Sunday, January 10, 2024

HARDCOVER FICTION
1. The House of Flame and Shadow
Sarah J. Maas, Bloomsbury, 9781635574043, $32.00
2. Holly
Stephen King, Scribner, 9781668016138, $30.00
`.trim();

      const result = BestsellerParser.parseList(sampleData);

      expect(result.title).toContain('BESTSELLERS');
      expect(result.date).toBe('Sunday, January 10, 2024');
      // The parser might create an extra category for the title line - filter to actual book categories
      const categoriesWithBooks = result.categories.filter(cat => cat.books.length > 0);
      expect(categoriesWithBooks).toHaveLength(1);
      expect(categoriesWithBooks[0].name).toBe('Hardcover Fiction');
      expect(categoriesWithBooks[0].books).toHaveLength(2);

      const firstBook = categoriesWithBooks[0].books[0];
      expect(firstBook.rank).toBe(1);
      expect(firstBook.title).toBe('The House of Flame and Shadow');
      expect(firstBook.author).toBe('Sarah J. Maas');
      expect(firstBook.publisher).toBe('Bloomsbury');
      expect(firstBook.isbn).toBe('9781635574043');
      expect(firstBook.price).toBe('$32.00');
    });

    it('should handle multi-line titles', () => {
      const sampleData = `
PACIFIC NORTHWEST BOOKSELLERS ASSOCIATION BESTSELLERS
for the week ended Sunday, January 10, 2024

HARDCOVER FICTION
1. The Very Long Title That Spans
Multiple Lines Here
Brandon Sanderson, Tor Books, 9781250899649, $32.99
`.trim();

      const result = BestsellerParser.parseList(sampleData);

      const categoriesWithBooks = result.categories.filter(cat => cat.books.length > 0);
      expect(categoriesWithBooks).toHaveLength(1);

      const book = categoriesWithBooks[0].books[0];
      expect(book).toBeDefined();
      expect(book.title).toContain('The Very Long Title That Spans');
      expect(book.title).toContain('Multiple Lines Here');
    });

    it('should handle books with 978 ISBN prefix', () => {
      const sampleData = `
HARDCOVER FICTION
1. Test Book
Author Name, Publisher, 9781234567890, $25.00
`.trim();

      const result = BestsellerParser.parseList(sampleData);

      expect(result.categories[0].books[0].isbn).toBe('9781234567890');
    });

    it('should handle books with 979 ISBN prefix', () => {
      const sampleData = `
HARDCOVER FICTION
1. Test Book
Author Name, Publisher, 9791234567890, $25.00
`.trim();

      const result = BestsellerParser.parseList(sampleData);

      expect(result.categories[0].books[0].isbn).toBe('9791234567890');
    });

    it('should handle multiple categories', () => {
      const sampleData = `
PACIFIC NORTHWEST BOOKSELLERS ASSOCIATION BESTSELLERS
for the week ended Sunday, January 10, 2024

HARDCOVER FICTION
1. Fiction Book
Author One, Publisher One, 9781234567890, $30.00

HARDCOVER NONFICTION
1. Nonfiction Book
Author Two, Publisher Two, 9781234567891, $28.00

YOUNG ADULT
1. YA Book
Author Three, Publisher Three, 9781234567892, $18.00
`.trim();

      const result = BestsellerParser.parseList(sampleData);

      const categoriesWithBooks = result.categories.filter(cat => cat.books.length > 0);
      expect(categoriesWithBooks).toHaveLength(3);
      expect(categoriesWithBooks[0].name).toBe('Hardcover Fiction');
      expect(categoriesWithBooks[1].name).toBe('Hardcover Nonfiction');
      expect(categoriesWithBooks[2].name).toBe('Young Adult');
    });

    it('should handle books without ISBN', () => {
      const sampleData = `
HARDCOVER FICTION
1. Test Book Without ISBN
Author Name, Publisher Name, $25.00
`.trim();

      const result = BestsellerParser.parseList(sampleData);

      const book = result.categories[0].books[0];
      expect(book.isbn).toBe('');
      expect(book.author).toBe('Author Name');
      expect(book.publisher).toBe('Publisher Name');
    });

    it('should handle books without price', () => {
      const sampleData = `
HARDCOVER FICTION
1. Test Book
Author Name, Publisher Name, 9781234567890
`.trim();

      const result = BestsellerParser.parseList(sampleData);

      const book = result.categories[0].books[0];
      expect(book.price).toBe('');
    });

    it('should handle empty lines and whitespace', () => {
      const sampleData = `

PACIFIC NORTHWEST BOOKSELLERS ASSOCIATION BESTSELLERS


for the week ended Sunday, January 10, 2024


HARDCOVER FICTION

1. Test Book
Author Name, Publisher, 9781234567890, $25.00

`.trim();

      const result = BestsellerParser.parseList(sampleData);

      const categoriesWithBooks = result.categories.filter(cat => cat.books.length > 0);
      expect(categoriesWithBooks).toHaveLength(1);
      expect(categoriesWithBooks[0].books).toHaveLength(1);
    });
  });

  describe('isCategoryHeader', () => {
    it('should identify valid category headers', () => {
      const validHeaders = [
        'HARDCOVER FICTION',
        'HARDCOVER NONFICTION',
        'YOUNG ADULT',
        'TRADE PAPERBACK FICTION',
      ];

      validHeaders.forEach(header => {
        const result = (BestsellerParser as unknown as { isCategoryHeader: (header: string) => boolean }).isCategoryHeader(header);
        expect(result).toBe(true);
      });
    });

    it('should reject invalid category headers', () => {
      const invalidHeaders = [
        '1. Book Title', // Starts with number
        'Test', // Too short
        'Book Title $25.00', // Contains price
        'Author Name, Publisher, 9781234567890', // Contains ISBN
        'lowercase text', // Not uppercase
      ];

      invalidHeaders.forEach(header => {
        const result = (BestsellerParser as unknown as { isCategoryHeader: (header: string) => boolean }).isCategoryHeader(header);
        expect(result).toBe(false);
      });
    });
  });

  describe('getDefaultAudience', () => {
    it('should return "A" for adult categories', () => {
      const adultCategories = [
        'Hardcover Fiction',
        'Hardcover Nonfiction',
        'Trade Paperback Fiction',
        'Trade Paperback Nonfiction',
        'Mass Market Paperback',
      ];

      adultCategories.forEach(category => {
        expect(BestsellerParser.getDefaultAudience(category)).toBe('A');
      });
    });

    it('should return "C" for children categories', () => {
      const childrenCategories = [
        "Children's Illustrated",
        'Early & Middle Grade Readers',
        "Children's Series Titles",
      ];

      childrenCategories.forEach(category => {
        expect(BestsellerParser.getDefaultAudience(category)).toBe('C');
      });
    });

    it('should return "T" for young adult category', () => {
      expect(BestsellerParser.getDefaultAudience('Young Adult')).toBe('T');
    });

    it('should default to "A" for unknown categories', () => {
      expect(BestsellerParser.getDefaultAudience('Unknown Category')).toBe('A');
    });
  });

  describe('weeks-on-list batching', () => {
    it('should fetch aggregated counts via RPC with deduped ISBNs', async () => {
      const rpcMock = supabaseClientMock.rpc as Mock;
      rpcMock.mockResolvedValueOnce({
        data: [
          { isbn: '9781234567890', weeks_on_list: 5 },
          { isbn: '9781234567891', weeks_on_list: 2 },
        ],
        error: null,
      });

      const result = await BestsellerParser.batchGetWeeksOnList([
        '9781234567890',
        '9781234567890',
        '9781234567891',
      ]);

      expect(rpcMock).toHaveBeenCalledTimes(1);
      expect(rpcMock).toHaveBeenCalledWith('get_weeks_on_list_batch_regional', {
        isbn_list: ['9781234567890', '9781234567891'],
        target_region: 'PNBA',
      });
      expect(result['9781234567890']).toBe(5);
      expect(result['9781234567891']).toBe(2);
    });

    it('should reuse cached results when available', async () => {
      const rpcMock = supabaseClientMock.rpc as Mock;
      rpcMock.mockResolvedValueOnce({
        data: [{ isbn: '9781234567890', weeks_on_list: 3 }],
        error: null,
      });

      const first = await BestsellerParser.batchGetWeeksOnList(['9781234567890']);
      const second = await BestsellerParser.batchGetWeeksOnList(['9781234567890']);

      expect(first['9781234567890']).toBe(3);
      expect(second['9781234567890']).toBe(3);
      expect(rpcMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('compareLists', () => {
    it('should identify new books (adds)', async () => {
      const currentList: BestsellerList = {
        title: 'Current List',
        date: 'January 10, 2024',
        categories: [
          {
            name: 'Hardcover Fiction',
            books: [
              {
                rank: 1,
                title: 'New Book',
                author: 'Author One',
                publisher: 'Publisher One',
                isbn: '9781234567890',
                price: '$30.00',
              },
              {
                rank: 2,
                title: 'Existing Book',
                author: 'Author Two',
                publisher: 'Publisher Two',
                isbn: '9781234567891',
                price: '$28.00',
              },
            ],
          },
        ],
      };

      const previousList: BestsellerList = {
        title: 'Previous List',
        date: 'January 3, 2024',
        categories: [
          {
            name: 'Hardcover Fiction',
            books: [
              {
                rank: 1,
                title: 'Existing Book',
                author: 'Author Two',
                publisher: 'Publisher Two',
                isbn: '9781234567891',
                price: '$28.00',
              },
            ],
          },
        ],
      };

      const result = await BestsellerParser.compareLists(currentList, previousList);

      expect(result.categories[0].books[0].isNew).toBe(true);
      expect(result.categories[0].books[1].isNew).toBe(false);
    });

    it('should identify dropped books', async () => {
      const currentList: BestsellerList = {
        title: 'Current List',
        date: 'January 10, 2024',
        categories: [
          {
            name: 'Hardcover Fiction',
            books: [
              {
                rank: 1,
                title: 'Book One',
                author: 'Author One',
                publisher: 'Publisher One',
                isbn: '9781234567890',
                price: '$30.00',
              },
            ],
          },
        ],
      };

      const previousList: BestsellerList = {
        title: 'Previous List',
        date: 'January 3, 2024',
        categories: [
          {
            name: 'Hardcover Fiction',
            books: [
              {
                rank: 1,
                title: 'Book One',
                author: 'Author One',
                publisher: 'Publisher One',
                isbn: '9781234567890',
                price: '$30.00',
              },
              {
                rank: 2,
                title: 'Dropped Book',
                author: 'Author Two',
                publisher: 'Publisher Two',
                isbn: '9781234567891',
                price: '$28.00',
              },
            ],
          },
        ],
      };

      const result = await BestsellerParser.compareLists(currentList, previousList);

      const droppedBook = result.categories[0].books.find(book => book.wasDropped);
      expect(droppedBook).toBeDefined();
      expect(droppedBook?.title).toBe('Dropped Book');
      expect(droppedBook?.wasDropped).toBe(true);
    });

    it('should track position changes', async () => {
      const currentList: BestsellerList = {
        title: 'Current List',
        date: 'January 10, 2024',
        categories: [
          {
            name: 'Hardcover Fiction',
            books: [
              {
                rank: 1,
                title: 'Book One',
                author: 'Author One',
                publisher: 'Publisher One',
                isbn: '9781234567890',
                price: '$30.00',
              },
            ],
          },
        ],
      };

      const previousList: BestsellerList = {
        title: 'Previous List',
        date: 'January 3, 2024',
        categories: [
          {
            name: 'Hardcover Fiction',
            books: [
              {
                rank: 3,
                title: 'Book One',
                author: 'Author One',
                publisher: 'Publisher One',
                isbn: '9781234567890',
                price: '$30.00',
              },
            ],
          },
        ],
      };

      const result = await BestsellerParser.compareLists(currentList, previousList);

      expect(result.categories[0].books[0].previousRank).toBe(3);
      expect(result.categories[0].books[0].rank).toBe(1);
    });

    it('should match books by ISBN when available', async () => {
      const currentList: BestsellerList = {
        title: 'Current List',
        date: 'January 10, 2024',
        categories: [
          {
            name: 'Hardcover Fiction',
            books: [
              {
                rank: 1,
                title: 'Book With Different Title',
                author: 'Author Name',
                publisher: 'Publisher',
                isbn: '9781234567890',
                price: '$30.00',
              },
            ],
          },
        ],
      };

      const previousList: BestsellerList = {
        title: 'Previous List',
        date: 'January 3, 2024',
        categories: [
          {
            name: 'Hardcover Fiction',
            books: [
              {
                rank: 2,
                title: 'Book With Original Title',
                author: 'Author Name',
                publisher: 'Publisher',
                isbn: '9781234567890',
                price: '$30.00',
              },
            ],
          },
        ],
      };

      const result = await BestsellerParser.compareLists(currentList, previousList);

      expect(result.categories[0].books[0].isNew).toBe(false);
      expect(result.categories[0].books[0].previousRank).toBe(2);
    });

    it('should fall back to title/author matching when ISBN is missing', async () => {
      const currentList: BestsellerList = {
        title: 'Current List',
        date: 'January 10, 2024',
        categories: [
          {
            name: 'Hardcover Fiction',
            books: [
              {
                rank: 1,
                title: 'Book Without ISBN',
                author: 'Author Name',
                publisher: 'Publisher',
                isbn: '',
                price: '$30.00',
              },
            ],
          },
        ],
      };

      const previousList: BestsellerList = {
        title: 'Previous List',
        date: 'January 3, 2024',
        categories: [
          {
            name: 'Hardcover Fiction',
            books: [
              {
                rank: 2,
                title: 'Book Without ISBN',
                author: 'Author Name',
                publisher: 'Publisher',
                isbn: '',
                price: '$30.00',
              },
            ],
          },
        ],
      };

      const result = await BestsellerParser.compareLists(currentList, previousList);

      expect(result.categories[0].books[0].isNew).toBe(false);
      expect(result.categories[0].books[0].previousRank).toBe(2);
    });

    it('should handle new categories', async () => {
      const currentList: BestsellerList = {
        title: 'Current List',
        date: 'January 10, 2024',
        categories: [
          {
            name: 'New Category',
            books: [
              {
                rank: 1,
                title: 'Book One',
                author: 'Author One',
                publisher: 'Publisher',
                isbn: '9781234567890',
                price: '$30.00',
              },
            ],
          },
        ],
      };

      const previousList: BestsellerList = {
        title: 'Previous List',
        date: 'January 3, 2024',
        categories: [],
      };

      const result = await BestsellerParser.compareLists(currentList, previousList);

      expect(result.categories[0].books[0].isNew).toBe(true);
    });
  });

  describe('caching behavior', () => {
    it('should call supabase methods during setCachedData', async () => {
      // Test that setCachedData completes without errors
      await expect(
        BestsellerParser.setCachedData('test_key', { test: 'data' })
      ).resolves.not.toThrow();
    });

    it('should return null when getCachedData finds no data', async () => {
      const result = await BestsellerParser.getCachedData('nonexistent_key');
      expect(result).toBeNull();
    });

    it('should identify current week correctly', () => {
      const currentDate = new Date('2024-01-10T00:00:00'); // Wednesday
      const result = BestsellerParser.isCurrentWeek(currentDate.toISOString());
      expect(result).toBe(true);
    });

    it('should identify non-current week correctly', () => {
      const oldDate = new Date('2024-01-03T00:00:00'); // Previous Wednesday
      const result = BestsellerParser.isCurrentWeek(oldDate.toISOString());
      expect(result).toBe(false);
    });

    it('should check if cache is recent', () => {
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      expect(BestsellerParser.isRecentCache(recentDate.toISOString(), 7)).toBe(true);
    });

    it('should identify stale cache', () => {
      const oldDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      expect(BestsellerParser.isRecentCache(oldDate.toISOString(), 7)).toBe(false);
    });
  });

  describe('formatCategoryName', () => {
    it('should format uppercase category names to title case', () => {
      const formatted = (BestsellerParser as unknown as { formatCategoryName: (name: string) => string }).formatCategoryName('HARDCOVER FICTION');
      expect(formatted).toBe('Hardcover Fiction');
    });

    it('should handle mixed case input', () => {
      const formatted = (BestsellerParser as unknown as { formatCategoryName: (name: string) => string }).formatCategoryName('young ADULT');
      expect(formatted).toBe('Young Adult');
    });
  });

  describe('getListUrls', () => {
    it('should generate correct URLs for PNBA lists', () => {
      const currentWed = new Date('2024-01-10T00:00:00');
      const previousWed = new Date('2024-01-03T00:00:00');

      const { current, previous } = BestsellerParser.getListUrls(currentWed, previousWed);

      expect(current).toContain('240110pn.txt');
      expect(previous).toContain('240103pn.txt');
      expect(current).toContain('bookweb.org');
    });

    it('should use DateUtils when dates not provided', () => {
      const { current, previous } = BestsellerParser.getListUrls();

      expect(current).toContain('pn.txt');
      expect(previous).toContain('pn.txt');
    });
  });

  describe('edge cases', () => {
    it('should handle malformed book entries gracefully', () => {
      const sampleData = `
HARDCOVER FICTION
1. Valid Book
Author, Publisher, 9781234567890, $25.00
2. Malformed Entry Without Details
3. Another Valid Book
Another Author, Another Publisher, 9781234567891, $30.00
`.trim();

      const result = BestsellerParser.parseList(sampleData);

      // Should parse the valid books and skip malformed entries
      const validBooks = result.categories[0].books.filter(book => book.isbn);
      expect(validBooks.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty input', () => {
      const result = BestsellerParser.parseList('');

      expect(result.categories).toEqual([]);
      expect(result.title).toBe('Better Bestsellers');
    });

    it('should handle lists with only headers', () => {
      const sampleData = `
PACIFIC NORTHWEST BOOKSELLERS ASSOCIATION BESTSELLERS
for the week ended Sunday, January 10, 2024
`.trim();

      const result = BestsellerParser.parseList(sampleData);

      expect(result.date).toBe('Sunday, January 10, 2024');
      // Parser may create empty categories for header lines, so check for categories with books
      const categoriesWithBooks = result.categories.filter(cat => cat.books.length > 0);
      expect(categoriesWithBooks).toEqual([]);
    });
  });

  describe('BestsellerParser - Multi-Region Support', () => {
    const mockCachedResult = {
      data: {
        current: {
          title: 'Test Bestsellers',
          date: 'January 10, 2024',
          categories: [{
            name: 'Hardcover Fiction',
            books: [{
              rank: 1,
              title: 'Test Book',
              author: 'Test Author',
              publisher: 'Test Publisher',
              isbn: '9781234567890',
              price: '$29.99'
            }]
          }]
        },
        previous: {
          title: 'Test Bestsellers',
          date: 'January 3, 2024',
          categories: []
        }
      },
      timestamp: Date.now()
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should fetch data for PNBA region', async () => {
      // Mock getCachedData to return valid cached data
      vi.spyOn(BestsellerParser, 'getCachedData').mockResolvedValue(mockCachedResult);

      const result = await BestsellerParser.fetchBestsellerData({ region: 'PNBA' });
      expect(result).toBeTruthy();
      expect(result.current).toBeDefined();
    });

    it('should construct correct URLs for SIBA region', () => {
      const currentWed = new Date('2024-11-06'); // A Wednesday
      const prevWed = new Date('2024-10-30');

      const urls = BestsellerParser.getListUrls(currentWed, prevWed, 'SIBA');

      expect(urls.current).toContain('si.txt');
      expect(urls.previous).toContain('si.txt');
    });

    it('should use region-specific cache keys', async () => {
      const spy = vi.spyOn(BestsellerParser, 'getCachedData').mockResolvedValue(mockCachedResult);

      await BestsellerParser.fetchBestsellerData({ region: 'SIBA' });

      expect(spy).toHaveBeenCalledWith(expect.stringContaining('SIBA'));
    });

    it('should default to PNBA if no region specified', async () => {
      const spy = vi.spyOn(BestsellerParser, 'getCachedData').mockResolvedValue(mockCachedResult);

      const result = await BestsellerParser.fetchBestsellerData();

      expect(result).toBeTruthy();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('PNBA'));
    });
  });
});
