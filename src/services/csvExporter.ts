/**
 * CSV Export Service
 *
 * Generates CSV files for bestseller lists in retailer-compatible format.
 * Format: ISBN,0,Title,,Author,,,,,Publisher,,,,,,,,
 */

import { BestsellerList } from '@/types/bestseller';
import { CsvError, logError } from '@/lib/errors';
import { trackEvent } from '@/lib/analytics';

export type CSVExportType = 'adds_no_drops' | 'adds' | 'drops';

interface CSVExportOptions {
  region?: string; // Region abbreviation (e.g., 'PNBA', 'SIBA') - optional, not included in filename if omitted
  type: CSVExportType;
  data: BestsellerList;
  audienceFilter?: string; // Optional audience filter for tracking
  /**
   * Emit the publisher in column 10 and quote fields that need it (RFC 4180).
   * Used by the Independent Press Top 40 export, where the publisher is the
   * point. Off by default so ABA exports stay byte-identical.
   */
  includePublisher?: boolean;
}

interface CSVExportResult {
  content: string;
  filename: string;
  bookCount: number;
}

/**
 * Quote a field per RFC 4180, but only when it needs it.
 *
 * Used exclusively by the includePublisher variant. The default path stays
 * unquoted — see formatBookAsCSVLine.
 */
const csvField = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/**
 * Format a book entry as a CSV line.
 *
 * Column 10 is Publisher. It is blank by default even though the data has
 * been available for some time: the ABA exports feed a POS import that has
 * consumed this exact byte layout for a long time, so filling the column (or
 * quoting anything) is opt-in per export rather than a global change.
 *
 * KNOWN ISSUE on the default path: fields are not escaped, so a comma in a
 * title or author shifts every column after it. This is long-standing and
 * deliberately preserved here — a test pins the current bytes. It is largely
 * invisible because ISBN and quantity are columns 1-2, ahead of any
 * comma-bearing field, so ordering still works while the trailing metadata
 * garbles. Fixing it means changing what the POS receives, which is a
 * decision for whoever owns that import.
 *
 * With includePublisher (the IPC variant) the publisher is emitted AND every
 * text field is quoted when needed. The two travel together on purpose:
 * adding a comma-bearing field to an unescaped row would actively corrupt it.
 */
const formatBookAsCSVLine = (
  book: { isbn?: string; title: string; author: string; publisher?: string },
  options: { includePublisher?: boolean } = {}
): string => {
  const isbn = book.isbn || '';

  if (!options.includePublisher) {
    const title = book.title || '';
    const author = book.author || '';
    return `${isbn},0,${title},,${author},,,,,,,,,,,,,`;
  }

  const title = csvField(book.title || '');
  const author = csvField(book.author || '');
  const publisher = csvField(book.publisher || '');
  return `${isbn},0,${title},,${author},,,,,${publisher},,,,,,,,`;
};

/**
 * Drop repeat appearances of the same book. ABA lists the same title in
 * several categories (especially the children's lists), but the CSV feeds a
 * flat retailer import, so each book should appear once. Books are keyed by
 * ISBN, falling back to title|author when the ISBN is missing.
 */
const dedupeBooks = <T extends {isbn?: string; title: string; author: string}>(
  books: T[]
): T[] => {
  const seen = new Set<string>();
  return books.filter(book => {
    const key = book.isbn || `${book.title}|${book.author}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Get current date in YYYYMMDD format for filename
 */
const getDateString = (): string => {
  const today = new Date();
  const year = today.getFullYear().toString();
  const month = (today.getMonth() + 1).toString().padStart(2, '0');
  const day = today.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
};

/**
 * Generate a CSV export based on type
 *
 * @param options - Export configuration including type and data
 * @param options.type - Export type: 'adds_no_drops' (current list), 'adds' (new books only), 'drops' (removed books only)
 * @param options.data - Bestseller list data with categories and books
 * @returns CSVExportResult with content, filename, and book count
 * @throws {CsvError} If data is invalid or missing
 *
 * @example
 * ```typescript
 * const result = generateBestsellerCSV({
 *   type: 'adds_no_drops',
 *   data: bestsellerList
 * });
 * console.log(result.filename); // "bs_adds_no_drops_20241016.csv"
 * console.log(result.bookCount); // 45
 * ```
 */
export const generateBestsellerCSV = (options: CSVExportOptions): CSVExportResult => {
  try {
    const { region, type, data, includePublisher } = options;

    if (!data || !data.categories) {
      throw new CsvError({ type, reason: 'invalid_data' });
    }

    const csvLines: string[] = [];
    const dateStr = getDateString();
    const regionPrefix = region ? `${region.toUpperCase()}_` : '';

    let books: Array<{ isbn?: string; title: string; author: string; publisher?: string; isNew?: boolean; wasDropped?: boolean }> = [];
    let filename = '';

    // Filter books based on export type
    switch (type) {
      case 'adds_no_drops':
        books = data.categories.flatMap(category =>
          category.books.filter(book => !book.wasDropped)
        );
        filename = `${regionPrefix}bs_adds_no_drops_${dateStr}.csv`;
        break;

      case 'adds':
        books = data.categories.flatMap(category =>
          category.books.filter(book => book.isNew)
        );
        filename = `${regionPrefix}bs_adds_${dateStr}.csv`;
        break;

      case 'drops':
        books = data.categories.flatMap(category =>
          category.books.filter(book => book.wasDropped)
        );
        filename = `${regionPrefix}bs_drops_${dateStr}.csv`;
        break;
    }

    books = dedupeBooks(books);

    // Format each book as CSV line
    books.forEach(book => {
      csvLines.push(formatBookAsCSVLine(book, { includePublisher }));
    });

    return {
      content: csvLines.join('\n'),
      filename,
      bookCount: books.length
    };
  } catch (error) {
    logError('csvExporter', error, { operation: 'generateBestsellerCSV', type: options.type });
    throw error;
  }
};

/**
 * Download a CSV file to the user's system
 *
 * Creates a downloadable CSV file and triggers the browser's download dialog.
 * Uses the Blob API and creates a temporary link element for download.
 *
 * @param result - CSV export result containing content and filename
 * @throws {CsvError} If content is empty or download fails
 *
 * @example
 * ```typescript
 * const result = generateBestsellerCSV({ type: 'adds', data: bestsellerList });
 * downloadCSV(result); // Triggers browser download of "bs_adds_20241016.csv"
 * ```
 */
export const downloadCSV = (result: CSVExportResult): void => {
  try {
    if (!result || !result.content) {
      throw new CsvError({ filename: result?.filename, reason: 'empty_content' });
    }

    const blob = new Blob([result.content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', result.filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up the URL object
    URL.revokeObjectURL(url);
  } catch (error) {
    logError('csvExporter', error, { operation: 'downloadCSV', filename: result?.filename });
    throw error;
  }
};

/**
 * Generate and download a CSV file in one call
 *
 * Convenience function that combines generateBestsellerCSV and downloadCSV.
 * Generates the CSV content and immediately triggers a browser download.
 *
 * @param options - Export configuration including type and data
 * @returns CSVExportResult with content, filename, and book count
 * @throws {CsvError} If data is invalid or download fails
 *
 * @example
 * ```typescript
 * // Generate and download in one call
 * const result = generateAndDownloadCSV({
 *   type: 'adds_no_drops',
 *   data: bestsellerList
 * });
 * console.log(`Downloaded ${result.bookCount} books`);
 * ```
 */
export const generateAndDownloadCSV = (options: CSVExportOptions): CSVExportResult => {
  const result = generateBestsellerCSV(options);

  // Track CSV export
  const typeMap: Record<CSVExportType, 'adds_no_drops' | 'adds_only' | 'drops_only'> = {
    'adds_no_drops': 'adds_no_drops',
    'adds': 'adds_only',
    'drops': 'drops_only'
  };

  trackEvent('csv_export', {
    type: typeMap[options.type],
    audience: options.audienceFilter || 'all'
  });

  downloadCSV(result);
  return result;
};
