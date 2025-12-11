/**
 * Book filtering utilities
 *
 * Shared predicates for filtering bestseller books by add/drop status,
 * audience classification, and search terms. Used by both general and
 * staff views to ensure consistent filtering behavior.
 *
 * @module bookFilters
 */

import type { BestsellerBook } from '@/types/bestseller';

/**
 * Check if book matches add/drop filter
 *
 * Determines if a book should be included based on its add/drop status.
 * Handles all filter types: adds, drops, adds-drops, no-drops, and all.
 *
 * @param book - Book to check
 * @param filter - Filter type (adds/drops/adds-drops/no-drops/all)
 * @returns True if book matches filter criteria
 *
 * @example
 * ```typescript
 * matchesAddDropFilter({ isNew: true, wasDropped: false }, 'adds')
 * // Returns: true
 *
 * matchesAddDropFilter({ isNew: false, wasDropped: true }, 'adds')
 * // Returns: false
 *
 * matchesAddDropFilter({ isNew: true, wasDropped: false }, 'all')
 * // Returns: true
 * ```
 */
export function matchesAddDropFilter(
  book: BestsellerBook,
  filter: string | null
): boolean {
  if (!filter || filter === 'all') return true;

  switch (filter) {
    case 'adds':
      return book.isNew === true;
    case 'drops':
      return book.wasDropped === true;
    case 'adds-drops':
      return book.isNew === true || book.wasDropped === true;
    case 'no-drops':
      return book.wasDropped !== true;
    default:
      return true;
  }
}

/**
 * Check if book matches audience filter
 *
 * Determines if a book should be included based on its audience classification.
 * Audience values: 'A' (Adult), 'T' (Teen), 'C' (Children).
 *
 * @param book - Book to check
 * @param audiences - ISBN to audience classification map
 * @param audienceFilter - Target audience ('A'/'T'/'C'/null for all)
 * @returns True if book matches audience filter
 *
 * @example
 * ```typescript
 * const audiences = { '9781234567890': 'A' };
 * matchesAudienceFilter({ isbn: '9781234567890' }, audiences, 'A')
 * // Returns: true
 *
 * matchesAudienceFilter({ isbn: '9781234567890' }, audiences, 'T')
 * // Returns: false
 *
 * matchesAudienceFilter({ isbn: '9781234567890' }, audiences, null)
 * // Returns: true (no filter)
 * ```
 */
export function matchesAudienceFilter(
  book: BestsellerBook,
  audiences: Record<string, string>,
  audienceFilter: string | null
): boolean {
  if (!audienceFilter || audienceFilter === 'all') return true;

  if (!book.isbn) return false;

  const bookAudience = audiences[book.isbn];
  return bookAudience === audienceFilter;
}

/**
 * Check if book matches search term
 *
 * Searches across title, author, and ISBN fields using case-insensitive
 * partial matching. Empty search terms match all books.
 *
 * @param book - Book to check
 * @param searchTerm - Search query string
 * @returns True if book matches search term
 *
 * @example
 * ```typescript
 * matchesSearchTerm({ title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' }, 'gatsby')
 * // Returns: true
 *
 * matchesSearchTerm({ title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' }, 'fitzgerald')
 * // Returns: true
 *
 * matchesSearchTerm({ title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' }, 'hemingway')
 * // Returns: false
 *
 * matchesSearchTerm({ title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' }, '')
 * // Returns: true (empty search matches all)
 * ```
 */
export function matchesSearchTerm(
  book: BestsellerBook,
  searchTerm: string
): boolean {
  if (!searchTerm || !searchTerm.trim()) return true;

  const query = searchTerm.toLowerCase();
  return (
    book.title.toLowerCase().includes(query) ||
    book.author.toLowerCase().includes(query) ||
    (book.isbn && book.isbn.toLowerCase().includes(query))
  );
}

/**
 * Apply all filters to a book
 *
 * Combines add/drop, audience, and search filtering into a single predicate.
 * A book must pass all active filters to be included.
 *
 * @param book - Book to check
 * @param options - Filter options (filter, audiences, audienceFilter, searchTerm)
 * @returns True if book passes all filters
 *
 * @example
 * ```typescript
 * const audiences = { '9781234567890': 'A' };
 * const book = { isbn: '9781234567890', title: 'Sample Book', isNew: true };
 *
 * matchesAllFilters(book, {
 *   filter: 'adds',
 *   audiences,
 *   audienceFilter: 'A',
 *   searchTerm: 'sample'
 * })
 * // Returns: true (passes all filters)
 *
 * matchesAllFilters(book, {
 *   filter: 'drops',
 *   audiences,
 *   audienceFilter: 'A',
 *   searchTerm: 'sample'
 * })
 * // Returns: false (book is 'add', not 'drop')
 * ```
 */
export function matchesAllFilters(
  book: BestsellerBook,
  options: {
    filter: string | null;
    audiences: Record<string, string>;
    audienceFilter: string | null;
    searchTerm: string;
  }
): boolean {
  return (
    matchesAddDropFilter(book, options.filter) &&
    matchesAudienceFilter(book, options.audiences, options.audienceFilter) &&
    matchesSearchTerm(book, options.searchTerm)
  );
}
