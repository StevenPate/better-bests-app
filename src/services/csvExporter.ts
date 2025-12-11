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
}

interface CSVExportResult {
  content: string;
  filename: string;
  bookCount: number;
}

/**
 * Format a book entry as a CSV line
 */
const formatBookAsCSVLine = (book: {
  isbn?: string;
  title: string;
  author: string;
}): string => {
  const isbn = book.isbn || '';
  const title = book.title || '';
  const author = book.author || '';
  const publisher = ''; // Not available in current data

  return `${isbn},0,${title},,${author},,,,,${publisher},,,,,,,,`;
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
    const { region, type, data } = options;

    if (!data || !data.categories) {
      throw new CsvError({ type, reason: 'invalid_data' });
    }

    const csvLines: string[] = [];
    const dateStr = getDateString();
    const regionPrefix = region ? `${region.toUpperCase()}_` : '';

    let books: Array<{ isbn?: string; title: string; author: string; isNew?: boolean; wasDropped?: boolean }> = [];
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

    // Format each book as CSV line
    books.forEach(book => {
      csvLines.push(formatBookAsCSVLine(book));
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
