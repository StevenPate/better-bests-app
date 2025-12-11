import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateBestsellerPDF } from './pdfGenerator';
import type { BestsellerBook, BestsellerList } from '@/types/bestseller';

vi.mock('jspdf', () => {
  const createDoc = () => ({
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    text: vi.fn(),
    rect: vi.fn(),
    addPage: vi.fn(),
    setFillColor: vi.fn(),
    save: vi.fn(),
  });

  const mockFn = vi.fn(() => createDoc());
  return {
    __esModule: true,
    default: mockFn,
  };
});

const mockBatchFetch = vi.hoisted(() => vi.fn());
vi.mock('./googleBooksApi', () => ({
  fetchGoogleBooksCategoriesBatch: mockBatchFetch,
}));

import * as analytics from '@/lib/analytics';

// Add mock setup for analytics
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn()
}));

import jsPDF from 'jspdf';
import { fetchGoogleBooksCategoriesBatch } from './googleBooksApi';

type MockFn = ReturnType<typeof vi.fn>;

const getLastDoc = () => {
  const mock = jsPDF as unknown as MockFn;
  const lastCall = mock.mock.results.at(-1);
  if (!lastCall) {
    throw new Error('jsPDF was not instantiated');
  }
  return lastCall.value as any;
};

const makeBook = (overrides: Partial<BestsellerBook> = {}): BestsellerBook => ({
  rank: 1,
  title: 'Sample Title',
  author: 'Sample Author',
  publisher: 'Sample Publisher',
  price: '$10.00',
  isbn: '9780000000000',
  ...overrides,
});

const makeList = (categories: BestsellerList['categories']): BestsellerList => ({
  title: 'PNBA',
  date: '2025-10-01',
  categories,
});

beforeEach(() => {
  mockBatchFetch.mockReset();
  const mock = jsPDF as unknown as MockFn;
  mock.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const collectProgress = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.map(([arg]) => arg);

describe('generateBestsellerPDF', () => {
  it('produces all-books PDF with progress updates and checkbox states', async () => {
    mockBatchFetch.mockResolvedValue({
      '9780000000001': 'Fiction',
      '9780000000002': 'History',
    });

    const progressSpy = vi.fn();

    const bestsellerData = makeList([
      {
        name: 'Adult Fiction',
        books: [
          makeBook({ isbn: '9780000000001', title: 'Alpha', author: 'Author A' }),
          makeBook({ isbn: '9780000000002', title: 'Beta', author: 'Author B' }),
        ],
      },
      {
        name: 'Children',
        books: [makeBook({ isbn: undefined as unknown as string, title: 'No ISBN' })],
      },
    ]);

    const bookAudiences = {
      '9780000000001': 'A',
      '9780000000002': 'T',
    } as const;

    const posChecked = { '9780000000001': true };
    const shelfChecked = { '9780000000002': true };

    const filename = await generateBestsellerPDF({
      includeAllBooks: true,
      bestsellerData,
      bookAudiences,
      posChecked,
      shelfChecked,
      onProgress: progressSpy,
    });

    expect(filename).toBe('PNBA-bestsellers-all.pdf');
    expect(fetchGoogleBooksCategoriesBatch).toHaveBeenCalledWith(
      ['9780000000001', '9780000000002'],
      10,
    );

    expect(collectProgress(progressSpy)).toEqual([
      {
        stage: 'fetching',
        message: 'Fetching genre information from Google Books...',
        percentage: 10,
      },
      {
        stage: 'fetching',
        message: 'Retrieved genres for 2 books',
        percentage: 50,
      },
      {
        stage: 'generating',
        message: 'Generating PDF document...',
        percentage: 60,
      },
      {
        stage: 'generating',
        message: 'Finalizing PDF...',
        percentage: 90,
      },
      {
        stage: 'complete',
        message: 'PDF generated successfully!',
        percentage: 100,
      },
    ]);

    const doc = getLastDoc();

    expect(doc.save).toHaveBeenCalledWith('PNBA-bestsellers-all.pdf');
    expect(doc.text).toHaveBeenCalledWith('✓', expect.any(Number), expect.any(Number));
    expect(doc.text).toHaveBeenCalledWith('No books found for this audience.', 20, expect.any(Number));
  });

  it('produces adds/drops PDF with section headings and empty states', async () => {
    mockBatchFetch.mockResolvedValue({
      '9780000000100': 'Fiction',
    });

    const bestsellerData = makeList([
      {
        name: 'Adult',
        books: [
          makeBook({ isbn: '9780000000100', title: 'Gamma', isNew: true }),
          makeBook({ isbn: '9780000000101', title: 'Delta', wasDropped: true }),
        ],
      },
    ]);

    const bookAudiences = {
      '9780000000100': 'A',
      '9780000000101': 'A',
    } as const;

    await generateBestsellerPDF({
      includeAllBooks: false,
      bestsellerData,
      bookAudiences,
      posChecked: {},
      shelfChecked: {},
      onProgress: vi.fn(),
    });

    const doc = getLastDoc();

    expect(doc.save).toHaveBeenCalledWith('PNBA-bestsellers-adds-drops.pdf');
    expect(doc.text).toHaveBeenCalledWith('Adds', 20, expect.any(Number));
    expect(doc.text).toHaveBeenCalledWith('Drops', 20, expect.any(Number));
    expect(doc.text).toHaveBeenCalledWith('No dropped books for this audience.', 20, expect.any(Number));
  });

  it('paginates when rows exceed a page height', async () => {
    mockBatchFetch.mockResolvedValue({});

    const manyBooks = Array.from({ length: 55 }, (_, index) =>
      makeBook({
        isbn: `9780000001${(index + 1).toString().padStart(3, '0')}`,
        title: `Book ${index + 1}`,
        author: `Author ${index + 1}`,
        isNew: true,
      }),
    );

    const bestsellerData = makeList([
      {
        name: 'Adult Fiction',
        books: manyBooks,
      },
    ]);

    const bookAudiences = manyBooks.reduce<Record<string, 'A'>>((acc, book) => {
      if (book.isbn) acc[book.isbn] = 'A';
      return acc;
    }, {});

    await generateBestsellerPDF({
      includeAllBooks: true,
      bestsellerData,
      bookAudiences,
      posChecked: {},
      shelfChecked: {},
    });

    const doc = getLastDoc();

    expect(doc.addPage).toHaveBeenCalled();
    expect(doc.text).toHaveBeenCalledWith('Page 1', 180, 285);
    expect(doc.text).toHaveBeenCalledWith('Page 2', 180, 285);
  });

  it('propagates errors when Google Books fetch fails', async () => {
    const failure = new Error('boom');
    mockBatchFetch.mockRejectedValue(failure);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const bestsellerData = makeList([
      {
        name: 'Adult Fiction',
        books: [makeBook({ isbn: '9780000000200' })],
      },
    ]);

    await expect(
      generateBestsellerPDF({
        includeAllBooks: true,
        bestsellerData,
        bookAudiences: { '9780000000200': 'A' },
        posChecked: {},
        shelfChecked: {},
      }),
    ).rejects.toThrow('boom');

    // The error should be logged
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('filters adds/drops by audience correctly (Adult section should not include Teen/Children)', async () => {
    mockBatchFetch.mockResolvedValue({
      '9780000000301': 'Fiction',
      '9780000000302': 'Fantasy',
      '9780000000303': 'Picture Books',
    });

    const bestsellerData = makeList([
      {
        name: 'Fiction',
        books: [
          makeBook({ isbn: '9780000000301', title: 'Adult Book', author: 'Adult Author', isNew: true }),
          makeBook({ isbn: '9780000000302', title: 'Teen Book', author: 'Teen Author', isNew: true }),
          makeBook({ isbn: '9780000000303', title: 'Children Book', author: 'Children Author', isNew: true }),
        ],
      },
    ]);

    const bookAudiences = {
      '9780000000301': 'A',
      '9780000000302': 'T',
      '9780000000303': 'C',
    } as const;

    await generateBestsellerPDF({
      includeAllBooks: false,
      bestsellerData,
      bookAudiences,
      posChecked: {},
      shelfChecked: {},
    });

    const doc = getLastDoc();

    // Get all text calls to verify correct section placement
    const textCalls = doc.text.mock.calls.map(call => call[0]);

    // Find section header indices (now includes region prefix)
    const adultHeaderIndex = textCalls.findIndex(text => text === 'PNBA Adult - 2025-10-01');
    const teenHeaderIndex = textCalls.findIndex(text => text === 'PNBA Teen - 2025-10-01');
    const childrenHeaderIndex = textCalls.findIndex(text => text === 'PNBA Children - 2025-10-01');

    // Find book indices
    const adultBookIndex = textCalls.findIndex(text => text === 'Adult Book');
    const teenBookIndex = textCalls.findIndex(text => text === 'Teen Book');
    const childrenBookIndex = textCalls.findIndex(text => text === 'Children Book');

    // Verify Adult Book appears in Adult section (after Adult header, before Teen header)
    expect(adultBookIndex).toBeGreaterThan(adultHeaderIndex);
    expect(adultBookIndex).toBeLessThan(teenHeaderIndex);

    // Verify Teen Book appears in Teen section (after Teen header, before Children header)
    expect(teenBookIndex).toBeGreaterThan(teenHeaderIndex);
    expect(teenBookIndex).toBeLessThan(childrenHeaderIndex);

    // Verify Children Book appears in Children section (after Children header)
    expect(childrenBookIndex).toBeGreaterThan(childrenHeaderIndex);
  });

  describe('Multi-Region Support', () => {
    it('should include region abbreviation in filename for all-books PDF', async () => {
      mockBatchFetch.mockResolvedValue({});

      const bestsellerData = makeList([
        {
          name: 'Adult Fiction',
          books: [makeBook({ isbn: '9780000000001', title: 'Test Book' })],
        },
      ]);

      const filename = await generateBestsellerPDF({
        region: 'SIBA',
        includeAllBooks: true,
        bestsellerData,
        bookAudiences: { '9780000000001': 'A' },
        posChecked: {},
        shelfChecked: {},
      });

      expect(filename).toBe('SIBA-bestsellers-all.pdf');
    });

    it('should include region abbreviation in filename for adds-drops PDF', async () => {
      mockBatchFetch.mockResolvedValue({});

      const bestsellerData = makeList([
        {
          name: 'Adult Fiction',
          books: [makeBook({ isbn: '9780000000001', title: 'Test Book', isNew: true })],
        },
      ]);

      const filename = await generateBestsellerPDF({
        region: 'GLIBA',
        includeAllBooks: false,
        bestsellerData,
        bookAudiences: { '9780000000001': 'A' },
        posChecked: {},
        shelfChecked: {},
      });

      expect(filename).toBe('GLIBA-bestsellers-adds-drops.pdf');
    });

    it('should default to PNBA when region not provided (backward compatibility)', async () => {
      mockBatchFetch.mockResolvedValue({});

      const bestsellerData = makeList([
        {
          name: 'Adult Fiction',
          books: [makeBook({ isbn: '9780000000001', title: 'Test Book' })],
        },
      ]);

      const filename = await generateBestsellerPDF({
        includeAllBooks: true,
        bestsellerData,
        bookAudiences: { '9780000000001': 'A' },
        posChecked: {},
        shelfChecked: {},
      });

      expect(filename).toBe('PNBA-bestsellers-all.pdf');
    });
  });

  describe('analytics tracking', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should track PDF download events for all books format', async () => {
      mockBatchFetch.mockResolvedValue({});

      const bestsellerData = makeList([
        {
          name: 'Adult Fiction',
          books: [makeBook({ isbn: '1234567890' })],
        },
      ]);

      await generateBestsellerPDF({
        region: 'PNBA',
        includeAllBooks: true,
        bestsellerData,
        bookAudiences: { '1234567890': 'A' },
        posChecked: {},
        shelfChecked: {},
      });

      expect(analytics.trackEvent).toHaveBeenCalledWith('pdf_download', {
        format: 'all',
        audience: 'adult'
      });
    });

    it('should track PDF download events for adds/drops format', async () => {
      mockBatchFetch.mockResolvedValue({});

      const bestsellerData = makeList([
        {
          name: 'Teen Fiction',
          books: [makeBook({ isbn: '1234567890', comparisonStatus: 'new' })],
        },
      ]);

      await generateBestsellerPDF({
        region: 'PNBA',
        includeAllBooks: false,
        bestsellerData,
        bookAudiences: { '1234567890': 'T' },
        posChecked: {},
        shelfChecked: {},
      });

      expect(analytics.trackEvent).toHaveBeenCalledWith('pdf_download', {
        format: 'adds_drops',
        audience: 'teen'
      });
    });
  });
});
