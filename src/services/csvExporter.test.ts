import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  generateBestsellerCSV,
  downloadCSV,
  generateAndDownloadCSV,
  type CSVExportType,
} from './csvExporter';
import { BestsellerList } from '@/types/bestseller';
import * as analytics from '@/lib/analytics';

// Add mock setup for analytics
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn()
}));

describe('csvExporter', () => {
  let mockBestsellerData: BestsellerList;

  beforeEach(() => {
    // Reset mock data before each test
    mockBestsellerData = {
      title: 'Test Bestsellers',
      date: 'January 10, 2024',
      categories: [
        {
          name: 'Fiction',
          books: [
            {
              rank: 1,
              title: 'New Fiction Book',
              author: 'Author One',
              publisher: 'Publisher One',
              isbn: '9781234567890',
              price: '$30.00',
              isNew: true,
              wasDropped: false,
            },
            {
              rank: 2,
              title: 'Existing Fiction Book',
              author: 'Author Two',
              publisher: 'Publisher Two',
              isbn: '9781234567891',
              price: '$28.00',
              isNew: false,
              wasDropped: false,
              previousRank: 3,
            },
            {
              rank: 0,
              title: 'Dropped Fiction Book',
              author: 'Author Three',
              publisher: 'Publisher Three',
              isbn: '9781234567892',
              price: '$25.00',
              isNew: false,
              wasDropped: true,
            },
          ],
        },
        {
          name: 'Nonfiction',
          books: [
            {
              rank: 1,
              title: 'New Nonfiction Book',
              author: 'Author Four',
              publisher: 'Publisher Four',
              isbn: '9781234567893',
              price: '$35.00',
              isNew: true,
              wasDropped: false,
            },
            {
              rank: 2,
              title: 'Existing Nonfiction Book',
              author: 'Author Five',
              publisher: 'Publisher Five',
              isbn: '9781234567894',
              price: '$32.00',
              isNew: false,
              wasDropped: false,
            },
          ],
        },
      ],
    };

    // Mock Date for consistent filename testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateBestsellerCSV', () => {
    describe('adds_no_drops export type', () => {
      it('should export all books except dropped ones', () => {
        const result = generateBestsellerCSV({
          type: 'adds_no_drops',
          data: mockBestsellerData,
        });

        expect(result.bookCount).toBe(4); // 2 fiction + 2 nonfiction (excluding dropped)
        expect(result.filename).toBe('bs_adds_no_drops_20240115.csv');

        const lines = result.content.split('\n');
        expect(lines).toHaveLength(4);

        // Verify dropped book is not included
        expect(result.content).not.toContain('Dropped Fiction Book');
        expect(result.content).toContain('New Fiction Book');
        expect(result.content).toContain('Existing Fiction Book');
      });

      it('should include both new and existing books', () => {
        const result = generateBestsellerCSV({
          type: 'adds_no_drops',
          data: mockBestsellerData,
        });

        expect(result.content).toContain('New Fiction Book');
        expect(result.content).toContain('Existing Fiction Book');
        expect(result.content).toContain('New Nonfiction Book');
        expect(result.content).toContain('Existing Nonfiction Book');
      });

      it('should use correct CSV format', () => {
        const result = generateBestsellerCSV({
          type: 'adds_no_drops',
          data: mockBestsellerData,
        });

        const lines = result.content.split('\n');
        const firstLine = lines[0];

        // Expected format: ISBN,0,Title,,Author,,,,,Publisher,,,,,,,,
        expect(firstLine).toMatch(/^\d+,0,.+,,.+,,,,,,,,,,,,,$/);
        expect(firstLine).toContain('9781234567890');
        expect(firstLine).toContain('New Fiction Book');
        expect(firstLine).toContain('Author One');
      });
    });

    describe('adds export type', () => {
      it('should export only new books', () => {
        const result = generateBestsellerCSV({
          type: 'adds',
          data: mockBestsellerData,
        });

        expect(result.bookCount).toBe(2); // Only new books
        expect(result.filename).toBe('bs_adds_20240115.csv');

        const lines = result.content.split('\n');
        expect(lines).toHaveLength(2);

        expect(result.content).toContain('New Fiction Book');
        expect(result.content).toContain('New Nonfiction Book');
        expect(result.content).not.toContain('Existing Fiction Book');
        expect(result.content).not.toContain('Dropped Fiction Book');
      });

      it('should handle lists with no new books', () => {
        const dataWithNoNewBooks: BestsellerList = {
          title: 'Test',
          date: 'January 10, 2024',
          categories: [
            {
              name: 'Fiction',
              books: [
                {
                  rank: 1,
                  title: 'Existing Book',
                  author: 'Author',
                  publisher: 'Publisher',
                  isbn: '9781234567890',
                  price: '$30.00',
                  isNew: false,
                  wasDropped: false,
                },
              ],
            },
          ],
        };

        const result = generateBestsellerCSV({
          type: 'adds',
          data: dataWithNoNewBooks,
        });

        expect(result.bookCount).toBe(0);
        expect(result.content).toBe('');
      });
    });

    describe('drops export type', () => {
      it('should export only dropped books', () => {
        const result = generateBestsellerCSV({
          type: 'drops',
          data: mockBestsellerData,
        });

        expect(result.bookCount).toBe(1); // Only dropped book
        expect(result.filename).toBe('bs_drops_20240115.csv');

        const lines = result.content.split('\n');
        expect(lines).toHaveLength(1);

        expect(result.content).toContain('Dropped Fiction Book');
        expect(result.content).not.toContain('New Fiction Book');
        expect(result.content).not.toContain('Existing Fiction Book');
      });

      it('should handle lists with no dropped books', () => {
        const dataWithNoDrops: BestsellerList = {
          title: 'Test',
          date: 'January 10, 2024',
          categories: [
            {
              name: 'Fiction',
              books: [
                {
                  rank: 1,
                  title: 'Active Book',
                  author: 'Author',
                  publisher: 'Publisher',
                  isbn: '9781234567890',
                  price: '$30.00',
                  isNew: true,
                  wasDropped: false,
                },
              ],
            },
          ],
        };

        const result = generateBestsellerCSV({
          type: 'drops',
          data: dataWithNoDrops,
        });

        expect(result.bookCount).toBe(0);
        expect(result.content).toBe('');
      });
    });

    describe('CSV format', () => {
      it('should format book data correctly', () => {
        const result = generateBestsellerCSV({
          type: 'adds_no_drops',
          data: mockBestsellerData,
        });

        const lines = result.content.split('\n');
        const line = lines[0];

        // Should have ISBN, 0, Title, empty, Author, multiple empties, Publisher (empty), more empties
        const parts = line.split(',');
        expect(parts[0]).toBe('9781234567890'); // ISBN
        expect(parts[1]).toBe('0'); // Always 0
        expect(parts[2]).toBe('New Fiction Book'); // Title
        expect(parts[3]).toBe(''); // Empty
        expect(parts[4]).toBe('Author One'); // Author
      });

      it('should handle books with special characters in title', () => {
        const dataWithSpecialChars: BestsellerList = {
          title: 'Test',
          date: 'January 10, 2024',
          categories: [
            {
              name: 'Fiction',
              books: [
                {
                  rank: 1,
                  title: 'Book with "Quotes" and, Commas',
                  author: "O'Brien, Author",
                  publisher: 'Publisher',
                  isbn: '9781234567890',
                  price: '$30.00',
                  isNew: true,
                  wasDropped: false,
                },
              ],
            },
          ],
        };

        const result = generateBestsellerCSV({
          type: 'adds',
          data: dataWithSpecialChars,
        });

        expect(result.content).toContain('Book with "Quotes" and, Commas');
        expect(result.content).toContain("O'Brien, Author");
      });

      it('should handle books without ISBN', () => {
        const dataWithoutISBN: BestsellerList = {
          title: 'Test',
          date: 'January 10, 2024',
          categories: [
            {
              name: 'Fiction',
              books: [
                {
                  rank: 1,
                  title: 'Book Without ISBN',
                  author: 'Author Name',
                  publisher: 'Publisher',
                  isbn: '',
                  price: '$30.00',
                  isNew: true,
                  wasDropped: false,
                },
              ],
            },
          ],
        };

        const result = generateBestsellerCSV({
          type: 'adds',
          data: dataWithoutISBN,
        });

        const line = result.content;
        expect(line).toMatch(/^,0,Book Without ISBN,,Author Name/);
      });

      it('should handle missing author or title', () => {
        const dataWithMissingFields: BestsellerList = {
          title: 'Test',
          date: 'January 10, 2024',
          categories: [
            {
              name: 'Fiction',
              books: [
                {
                  rank: 1,
                  title: '',
                  author: '',
                  publisher: 'Publisher',
                  isbn: '9781234567890',
                  price: '$30.00',
                  isNew: true,
                  wasDropped: false,
                },
              ],
            },
          ],
        };

        const result = generateBestsellerCSV({
          type: 'adds',
          data: dataWithMissingFields,
        });

        expect(result.content).toContain('9781234567890,0,,,');
      });
    });

    describe('filename generation', () => {
      it('should generate correct filename for adds_no_drops', () => {
        const result = generateBestsellerCSV({
          type: 'adds_no_drops',
          data: mockBestsellerData,
        });

        expect(result.filename).toBe('bs_adds_no_drops_20240115.csv');
      });

      it('should generate correct filename for adds', () => {
        const result = generateBestsellerCSV({
          type: 'adds',
          data: mockBestsellerData,
        });

        expect(result.filename).toBe('bs_adds_20240115.csv');
      });

      it('should generate correct filename for drops', () => {
        const result = generateBestsellerCSV({
          type: 'drops',
          data: mockBestsellerData,
        });

        expect(result.filename).toBe('bs_drops_20240115.csv');
      });

      it('should include correct date in filename', () => {
        // Set a specific date
        vi.setSystemTime(new Date('2024-03-25T10:30:00Z'));

        const result = generateBestsellerCSV({
          type: 'adds',
          data: mockBestsellerData,
        });

        expect(result.filename).toBe('bs_adds_20240325.csv');
      });

      it('should pad single-digit months and days', () => {
        // January 5, 2024
        vi.setSystemTime(new Date('2024-01-05T10:30:00Z'));

        const result = generateBestsellerCSV({
          type: 'adds',
          data: mockBestsellerData,
        });

        expect(result.filename).toBe('bs_adds_20240105.csv');
      });

      describe('Multi-Region Support', () => {
        it('should include region abbreviation in filename for adds_no_drops', () => {
          const result = generateBestsellerCSV({
            region: 'SIBA',
            type: 'adds_no_drops',
            data: mockBestsellerData,
          });

          expect(result.filename).toBe('SIBA_bs_adds_no_drops_20240115.csv');
        });

        it('should include region abbreviation in filename for adds', () => {
          const result = generateBestsellerCSV({
            region: 'GLIBA',
            type: 'adds',
            data: mockBestsellerData,
          });

          expect(result.filename).toBe('GLIBA_bs_adds_20240115.csv');
        });

        it('should include region abbreviation in filename for drops', () => {
          const result = generateBestsellerCSV({
            region: 'NAIBA',
            type: 'drops',
            data: mockBestsellerData,
          });

          expect(result.filename).toBe('NAIBA_bs_drops_20240115.csv');
        });

        it('should default to PNBA when region not provided (backward compatibility)', () => {
          const result = generateBestsellerCSV({
            type: 'adds',
            data: mockBestsellerData,
          });

          expect(result.filename).toBe('bs_adds_20240115.csv');
        });
      });
    });

    describe('edge cases', () => {
      it('should handle empty categories', () => {
        const emptyData: BestsellerList = {
          title: 'Test',
          date: 'January 10, 2024',
          categories: [],
        };

        const result = generateBestsellerCSV({
          type: 'adds_no_drops',
          data: emptyData,
        });

        expect(result.bookCount).toBe(0);
        expect(result.content).toBe('');
      });

      it('should handle categories with no books', () => {
        const dataWithEmptyCategory: BestsellerList = {
          title: 'Test',
          date: 'January 10, 2024',
          categories: [
            {
              name: 'Fiction',
              books: [],
            },
            {
              name: 'Nonfiction',
              books: [],
            },
          ],
        };

        const result = generateBestsellerCSV({
          type: 'adds_no_drops',
          data: dataWithEmptyCategory,
        });

        expect(result.bookCount).toBe(0);
        expect(result.content).toBe('');
      });

      it('should handle books across multiple categories', () => {
        const result = generateBestsellerCSV({
          type: 'adds_no_drops',
          data: mockBestsellerData,
        });

        // Should flatten books from all categories
        expect(result.bookCount).toBe(4);
        const lines = result.content.split('\n');
        expect(lines).toHaveLength(4);
      });

      it('should preserve book order from categories', () => {
        const result = generateBestsellerCSV({
          type: 'adds_no_drops',
          data: mockBestsellerData,
        });

        const lines = result.content.split('\n');
        // First category's books should come first
        expect(lines[0]).toContain('New Fiction Book');
        expect(lines[1]).toContain('Existing Fiction Book');
        // Second category's books should follow
        expect(lines[2]).toContain('New Nonfiction Book');
        expect(lines[3]).toContain('Existing Nonfiction Book');
      });
    });
  });

  describe('downloadCSV', () => {
    let createElementSpy: ReturnType<typeof vi.spyOn>;
    let appendChildSpy: ReturnType<typeof vi.spyOn>;
    let removeChildSpy: ReturnType<typeof vi.spyOn>;
    let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
    let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Mock DOM methods
      const mockLink = {
        setAttribute: vi.fn(),
        click: vi.fn(),
        style: {},
      };

      createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
      appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node);
      removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as Node);

      // Mock URL methods - need to define them if they don't exist
      if (!URL.createObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(), writable: true, configurable: true });
      }
      if (!URL.revokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true, configurable: true });
      }

      createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      // Mock Blob
      global.Blob = vi.fn().mockImplementation((content, options) => ({
        content,
        options,
      })) as unknown as typeof Blob;
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should create a Blob with correct content and type', () => {
      const result = {
        content: 'test,csv,content',
        filename: 'test.csv',
        bookCount: 1,
      };

      downloadCSV(result);

      expect(global.Blob).toHaveBeenCalledWith(['test,csv,content'], {
        type: 'text/csv;charset=utf-8;',
      });
    });

    it('should create an anchor element and trigger download', () => {
      const result = {
        content: 'test,csv,content',
        filename: 'test.csv',
        bookCount: 1,
      };

      downloadCSV(result);

      expect(createElementSpy).toHaveBeenCalledWith('a');
      const mockLink = createElementSpy.mock.results[0].value;
      expect(mockLink.setAttribute).toHaveBeenCalledWith('href', 'blob:mock-url');
      expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'test.csv');
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('should clean up after download', () => {
      const result = {
        content: 'test,csv,content',
        filename: 'test.csv',
        bookCount: 1,
      };

      downloadCSV(result);

      expect(appendChildSpy).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalled();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
    });
  });

  describe('generateAndDownloadCSV', () => {
    beforeEach(() => {
      // Mock DOM methods for download to prevent actual download
      const mockLink = {
        setAttribute: vi.fn(),
        click: vi.fn(),
        style: {},
      };

      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as Node);

      // Mock URL methods - need to define them if they don't exist
      if (!URL.createObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(), writable: true, configurable: true });
      }
      if (!URL.revokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), writable: true, configurable: true });
      }

      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      global.Blob = vi.fn().mockImplementation((content, options) => ({
        content,
        options,
      })) as unknown as typeof Blob;
    });

    it('should generate CSV and return result', () => {
      const result = generateAndDownloadCSV({
        type: 'adds',
        data: mockBestsellerData,
      });

      expect(result.bookCount).toBe(2);
      expect(result.filename).toBe('bs_adds_20240115.csv');
      expect(result.content).toBeTruthy();
    });

    it('should trigger download with correct data', () => {
      const result = generateAndDownloadCSV({
        type: 'adds',
        data: mockBestsellerData,
      });

      // Verify result is valid
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('bookCount');
      expect(result.bookCount).toBe(2);
    });

    it('should work with different export types', () => {
      const types: CSVExportType[] = ['adds_no_drops', 'adds', 'drops'];

      types.forEach((type) => {
        const result = generateAndDownloadCSV({
          type,
          data: mockBestsellerData,
        });

        expect(result).toBeDefined();
        expect(result.filename).toContain(type);
      });
    });
  });

  describe('analytics tracking', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should track CSV export for adds_no_drops', () => {
      generateAndDownloadCSV({
        type: 'adds_no_drops',
        data: mockBestsellerData,
        audienceFilter: 'adult',
      });

      expect(analytics.trackEvent).toHaveBeenCalledWith('csv_export', {
        type: 'adds_no_drops',
        audience: 'adult'
      });
    });

    it('should track CSV export for adds_only', () => {
      generateAndDownloadCSV({
        type: 'adds',
        data: mockBestsellerData,
        audienceFilter: 'teen',
      });

      expect(analytics.trackEvent).toHaveBeenCalledWith('csv_export', {
        type: 'adds_only',
        audience: 'teen'
      });
    });

    it('should track CSV export for drops_only', () => {
      generateAndDownloadCSV({
        type: 'drops',
        data: mockBestsellerData,
        audienceFilter: 'children',
      });

      expect(analytics.trackEvent).toHaveBeenCalledWith('csv_export', {
        type: 'drops_only',
        audience: 'children'
      });
    });
  });
});
