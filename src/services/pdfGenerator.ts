/**
 * PDF Generation Service
 *
 * Creates formatted PDF reports for bestseller lists with:
 * - Checkboxes for POS and shelf management
 * - Genre classification from Google Books
 * - Multiple audience sections (Adult/Teen/Children)
 * - Separate modes for "all books" vs "adds/drops only"
 * - Real-time progress indicators for long-running operations
 *
 * Performance:
 * - Uses parallel batch fetching for Google Books API (10 concurrent requests)
 * - Provides progress callbacks (0-100%) through three stages:
 *   1. Fetching genre data (0-50%)
 *   2. Generating PDF document (50-90%)
 *   3. Saving file (90-100%)
 */

import jsPDF from 'jspdf';
import { BestsellerList } from '@/types/bestseller';
import { fetchGoogleBooksCategoriesBatch } from './googleBooksApi';
import { logger } from '@/lib/logger';
import { PdfError, logError, wrapError } from '@/lib/errors';
import { trackEvent } from '@/lib/analytics';

export interface PDFGenerationOptions {
  region?: string; // Region abbreviation (e.g., 'PNBA', 'SIBA') - defaults to 'PNBA'
  includeAllBooks: boolean; // true = all books, false = adds/drops only
  bestsellerData: BestsellerList;
  bookAudiences: Record<string, string>; // ISBN -> audience (A/T/C)
  posChecked: Record<string, boolean>; // ISBN -> checked state
  shelfChecked: Record<string, boolean>; // ISBN -> checked state
  onProgress?: (progress: PDFGenerationProgress) => void; // Optional progress callback
}

export interface PDFGenerationProgress {
  stage: 'fetching' | 'generating' | 'complete';
  message: string;
  percentage: number; // 0-100
}

interface BookForPDF {
  isbn?: string;
  title: string;
  author: string;
  listName: string;
  isNew?: boolean;
  wasDropped?: boolean;
}

const AUDIENCES = {
  A: 'Adult',
  T: 'Teen',
  C: 'Children'
} as const;

/**
 * Truncate text to fit within PDF column width
 */
const truncateText = (text: string, maxLength: number): string => {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

/**
 * Render table headers for book listing
 */
const renderTableHeaders = (doc: jsPDF, yPosition: number): number => {
  doc.setFontSize(8);
  doc.setFont(undefined, 'bold');
  doc.text('Title', 16, yPosition);
  doc.text('Author', 65, yPosition);
  doc.text('Genre', 95, yPosition);
  doc.text('Category', 115, yPosition);
  doc.text('POS', 155, yPosition);
  doc.text('Shelf', 165, yPosition);
  doc.text('ISBN', 175, yPosition);
  return yPosition + 5;
};

/**
 * Render a single book row in the PDF
 */
const renderBookRow = (
  doc: jsPDF,
  book: BookForPDF,
  yPosition: number,
  rowIndex: number,
  googleCategory: string,
  isPosChecked: boolean,
  isShelfChecked: boolean
): number => {
  // Alternating row background
  if (rowIndex % 2 === 1) {
    doc.setFillColor(245, 245, 245);
    doc.rect(12, yPosition - 4, 185, 6, 'F');
  }

  doc.setFontSize(7);
  doc.text(truncateText(book.title, 36), 16, yPosition);
  doc.text(truncateText(book.author, 14), 65, yPosition);
  doc.text(truncateText(googleCategory, 7), 95, yPosition);
  doc.text(truncateText(book.listName, 18), 115, yPosition);

  // POS checkbox
  doc.rect(155, yPosition - 3, 3, 3);
  if (isPosChecked) {
    doc.text('✓', 155.5, yPosition - 0.5);
  }

  // Shelf checkbox
  doc.rect(165, yPosition - 3, 3, 3);
  if (isShelfChecked) {
    doc.text('✓', 165.5, yPosition - 0.5);
  }

  doc.text(book.isbn || '', 175, yPosition);
  return yPosition + 6;
};

/**
 * Add footer to current page
 */
const addFooter = (doc: jsPDF, date: string, pageNum: number): void => {
  doc.setFontSize(7);
  doc.text(date, 20, 285);
  doc.text(`Page ${pageNum}`, 180, 285);
};

/**
 * Render a section of books (handles pagination automatically)
 */
const renderBookSection = async (
  doc: jsPDF,
  books: BookForPDF[],
  googleBooksCategories: Record<string, string>,
  posChecked: Record<string, boolean>,
  shelfChecked: Record<string, boolean>,
  date: string,
  currentPageNum: { value: number },
  startYPosition: number = 20
): Promise<number> => {
  let yPosition = startYPosition;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];

    // Check if we need a new page
    if (yPosition > 260) {
      addFooter(doc, date, currentPageNum.value);
      doc.addPage();
      currentPageNum.value++;
      yPosition = 20;
      yPosition = renderTableHeaders(doc, yPosition);
      doc.setFont(undefined, 'normal');
    }

    const googleCategory = book.isbn ? googleBooksCategories[book.isbn] : 'Unknown';
    const isPosChecked = book.isbn ? posChecked[book.isbn] || false : false;
    const isShelfChecked = book.isbn ? shelfChecked[book.isbn] || false : false;

    yPosition = renderBookRow(
      doc,
      book,
      yPosition,
      i,
      googleCategory || 'Unknown',
      isPosChecked,
      isShelfChecked
    );
  }

  return yPosition;
};

/**
 * Generate PDF for all books (single list per audience)
 */
const generateAllBooksPDF = async (
  doc: jsPDF,
  options: PDFGenerationOptions,
  googleBooksCategories: Record<string, string>
): Promise<void> => {
  const audiences: Array<keyof typeof AUDIENCES> = ['A', 'T', 'C'];
  const { region = 'PNBA', bestsellerData, bookAudiences, posChecked, shelfChecked } = options;
  const currentPageNum = { value: 1 };

  for (let index = 0; index < audiences.length; index++) {
    const audienceCode = audiences[index];
    const audienceName = AUDIENCES[audienceCode];

    if (index > 0) {
      doc.addPage();
      currentPageNum.value++;
    }

    // Title with region
    doc.setFontSize(14);
    doc.text(`${region} Better Bestsellers for ${bestsellerData.date || 'Current Week'} - ${audienceName}`, 20, 20);

    // Get books for this audience
    const audienceBooks: BookForPDF[] = bestsellerData.categories.flatMap(category =>
      category.books
        .filter(book => {
          const bookAudience = book.isbn ? bookAudiences[book.isbn] : null;
          return !Object.keys(bookAudiences).length || bookAudience === audienceCode;
        })
        .map(book => ({ ...book, listName: category.name }))
    );

    let yPosition = 35;

    if (audienceBooks.length === 0) {
      doc.setFontSize(10);
      doc.text('No books found for this audience.', 20, yPosition);
    } else {
      yPosition = renderTableHeaders(doc, yPosition);
      doc.setFont(undefined, 'normal');

      yPosition = await renderBookSection(
        doc,
        audienceBooks,
        googleBooksCategories,
        posChecked,
        shelfChecked,
        bestsellerData.date || 'Current Week',
        currentPageNum,
        yPosition
      );
    }

    // Add footer to last page of section
    addFooter(doc, bestsellerData.date || 'Current Week', currentPageNum.value);
  }
};

/**
 * Generate PDF for adds/drops (separate sections for adds and drops)
 */
const generateAddsDropsPDF = async (
  doc: jsPDF,
  options: PDFGenerationOptions,
  googleBooksCategories: Record<string, string>
): Promise<void> => {
  const audiences: Array<keyof typeof AUDIENCES> = ['A', 'T', 'C'];
  const { region = 'PNBA', bestsellerData, bookAudiences, posChecked, shelfChecked } = options;
  const currentPageNum = { value: 1 };

  for (let index = 0; index < audiences.length; index++) {
    const audienceCode = audiences[index];
    const audienceName = AUDIENCES[audienceCode];

    if (index > 0) {
      doc.addPage();
      currentPageNum.value++;
    }

    // Filter books by audience
    const addsBooks: BookForPDF[] = bestsellerData.categories.flatMap(category =>
      category.books
        .filter(book => {
          const bookAudience = book.isbn ? bookAudiences[book.isbn] : null;
          const matchesAudience = !Object.keys(bookAudiences).length || bookAudience === audienceCode;
          return matchesAudience && book.isNew;
        })
        .map(book => ({ ...book, listName: category.name }))
    );

    const dropsBooks: BookForPDF[] = bestsellerData.categories.flatMap(category =>
      category.books
        .filter(book => {
          const bookAudience = book.isbn ? bookAudiences[book.isbn] : null;
          const matchesAudience = !Object.keys(bookAudiences).length || bookAudience === audienceCode;
          return matchesAudience && book.wasDropped;
        })
        .map(book => ({ ...book, listName: category.name }))
    );

    let yPosition = 20;

    // Audience title with region
    doc.setFontSize(14);
    doc.text(`${region} ${audienceName} - ${bestsellerData.date || 'Current Week'}`, 20, yPosition);
    yPosition += 15;

    // Adds section
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Adds', 20, yPosition);
    yPosition += 10;

    if (addsBooks.length === 0) {
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text('No new books for this audience.', 20, yPosition);
      yPosition += 10;
    } else {
      yPosition = renderTableHeaders(doc, yPosition);
      doc.setFont(undefined, 'normal');

      yPosition = await renderBookSection(
        doc,
        addsBooks,
        googleBooksCategories,
        posChecked,
        shelfChecked,
        bestsellerData.date || 'Current Week',
        currentPageNum,
        yPosition
      );
    }

    yPosition += 10;

    // Drops section
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('Drops', 20, yPosition);
    yPosition += 10;

    if (dropsBooks.length === 0) {
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text('No dropped books for this audience.', 20, yPosition);
    } else {
      yPosition = renderTableHeaders(doc, yPosition);
      doc.setFont(undefined, 'normal');

      await renderBookSection(
        doc,
        dropsBooks,
        googleBooksCategories,
        posChecked,
        shelfChecked,
        bestsellerData.date || 'Current Week',
        currentPageNum,
        yPosition
      );
    }

    // Add footer to last page of section
    addFooter(doc, bestsellerData.date || 'Current Week', currentPageNum.value);
  }
};

/**
 * Generate and download a formatted PDF report for bestseller lists
 *
 * Creates a professional multi-page PDF with:
 * - Separate sections for Adult, Teen, and Children audiences
 * - Genre classification from Google Books API
 * - POS and Shelf management checkboxes
 * - Automatic pagination with headers and footers
 * - Real-time progress tracking (0-100%)
 *
 * Two modes available:
 * - All Books: Complete list with all titles
 * - Adds/Drops: Separate sections for new and removed books only
 *
 * @param options - PDF generation configuration
 * @param options.includeAllBooks - true = all books, false = adds/drops only
 * @param options.bestsellerData - Bestseller list data with categories and books
 * @param options.bookAudiences - Map of ISBN to audience code (A/T/C)
 * @param options.posChecked - Map of ISBN to POS checkbox state
 * @param options.shelfChecked - Map of ISBN to shelf checkbox state
 * @param options.onProgress - Optional callback for progress updates (3 stages: fetching, generating, complete)
 * @returns Filename of the generated PDF
 * @throws {PdfError} If data is invalid or PDF generation fails
 *
 * @example
 * ```typescript
 * const filename = await generateBestsellerPDF({
 *   includeAllBooks: true,
 *   bestsellerData: list,
 *   bookAudiences: { '9781234567890': 'A' },
 *   posChecked: {},
 *   shelfChecked: {},
 *   onProgress: (progress) => {
 *     console.log(`${progress.stage}: ${progress.percentage}%`);
 *   }
 * });
 * // Console output:
 * // "fetching: 10%"
 * // "fetching: 50%"
 * // "generating: 60%"
 * // "generating: 90%"
 * // "complete: 100%"
 * console.log(filename); // "pnba-bestsellers-all.pdf"
 * ```
 */
export const generateBestsellerPDF = async (options: PDFGenerationOptions): Promise<string> => {
  const { onProgress, region = 'PNBA' } = options;

  try {
    // Validate input data
    if (!options.bestsellerData || !options.bestsellerData.categories) {
      throw new PdfError({ reason: 'invalid_data' });
    }

    const doc = new jsPDF();

    // Phase 1: Fetch Google Books categories (0-50%)
    try {
      onProgress?.({
        stage: 'fetching',
        message: 'Fetching genre information from Google Books...',
        percentage: 10,
      });
    } catch (progressError) {
      // Log but don't fail on progress callback errors
      logError('pdfGenerator', progressError, { operation: 'onProgress', stage: 'fetching' });
    }

    const allBooks = options.bestsellerData.categories.flatMap(category =>
      category.books.filter(book => book.isbn).map(book => book.isbn!)
    );

    const googleBooksCategories = await fetchGoogleBooksCategoriesBatch(allBooks, 10);

    try {
      onProgress?.({
        stage: 'fetching',
        message: `Retrieved genres for ${Object.keys(googleBooksCategories).length} books`,
        percentage: 50,
      });
    } catch (progressError) {
      logError('pdfGenerator', progressError, { operation: 'onProgress', stage: 'fetching' });
    }

    // Phase 2: Generate PDF (50-90%)
    try {
      onProgress?.({
        stage: 'generating',
        message: 'Generating PDF document...',
        percentage: 60,
      });
    } catch (progressError) {
      logError('pdfGenerator', progressError, { operation: 'onProgress', stage: 'generating' });
    }

    if (options.includeAllBooks) {
      await generateAllBooksPDF(doc, options, googleBooksCategories);
    } else {
      await generateAddsDropsPDF(doc, options, googleBooksCategories);
    }

    try {
      onProgress?.({
        stage: 'generating',
        message: 'Finalizing PDF...',
        percentage: 90,
      });
    } catch (progressError) {
      logError('pdfGenerator', progressError, { operation: 'onProgress', stage: 'generating' });
    }

    // Phase 3: Save (90-100%)
    const regionPrefix = (options.region || 'PNBA').toUpperCase();
    const filename = options.includeAllBooks
      ? `${regionPrefix}-bestsellers-all.pdf`
      : `${regionPrefix}-bestsellers-adds-drops.pdf`;

    // Track PDF download
    const uniqueAudiences = new Set(Object.values(options.bookAudiences));
    let audience: 'adult' | 'teen' | 'children' | 'all';
    if (uniqueAudiences.size === 1) {
      const audienceCode = Array.from(uniqueAudiences)[0];
      audience = audienceCode === 'A' ? 'adult' : audienceCode === 'T' ? 'teen' : audienceCode === 'C' ? 'children' : 'all';
    } else {
      audience = 'all';
    }

    trackEvent('pdf_download', {
      format: options.includeAllBooks ? 'all' : 'adds_drops',
      audience
    });

    try {
      doc.save(filename);
    } catch (saveError) {
      throw new PdfError({ reason: 'save_failed', filename }, saveError);
    }

    try {
      onProgress?.({
        stage: 'complete',
        message: 'PDF generated successfully!',
        percentage: 100,
      });
    } catch (progressError) {
      logError('pdfGenerator', progressError, { operation: 'onProgress', stage: 'complete' });
    }

    return filename;
  } catch (error) {
    logError('pdfGenerator', error, { operation: 'generateBestsellerPDF', includeAllBooks: options.includeAllBooks });

    // Wrap in PdfError if not already an AppError
    if (error instanceof Error && error.name !== 'PdfError') {
      throw wrapError(error);
    }

    throw error;
  }
};
