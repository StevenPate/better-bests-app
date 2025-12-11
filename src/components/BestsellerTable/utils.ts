import { Star, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { BestsellerTableBook, RankChangeType, SortOrder } from './types';

/**
 * Generate a unique key for a book in the list
 */
export function getBookKey(book: BestsellerTableBook, index: number): string {
  return `${book.isbn || book.title}-${index}`;
}

/**
 * Check if a book is eligible for switching (new or dropped)
 */
export function isEligibleForSwitching(book: BestsellerTableBook): boolean {
  return book.isNew === true || book.wasDropped === true;
}

/**
 * Determine the type of rank change for a book
 */
export function getRankChangeType(book: BestsellerTableBook): RankChangeType {
  if (book.isNew) return 'new';
  if (book.wasDropped) return 'dropped';
  if (book.previousRank && book.previousRank > book.rank) return 'up';
  if (book.previousRank && book.previousRank < book.rank) return 'down';
  return 'unchanged';
}

/**
 * Get the appropriate icon component for a book's rank change
 */
export function getRankChangeIcon(book: BestsellerTableBook) {
  const changeType = getRankChangeType(book);

  switch (changeType) {
    case 'new':
      return Star;
    case 'dropped':
      return TrendingDown;
    case 'up':
      return TrendingUp;
    case 'down':
      return TrendingDown;
    default:
      return Minus;
  }
}

/**
 * Get the CSS classes for the icon based on rank change
 */
export function getRankChangeIconClasses(book: BestsellerTableBook): string {
  const changeType = getRankChangeType(book);

  switch (changeType) {
    case 'new':
      return 'w-3.5 h-3.5 text-green-400';
    case 'dropped':
      return 'w-3.5 h-3.5 text-red-400';
    case 'up':
      return 'w-3.5 h-3.5 text-green-400';
    case 'down':
      return 'w-3.5 h-3.5 text-red-400';
    default:
      return 'w-3.5 h-3.5 text-gray-600';
  }
}

/**
 * Get the text representation of a book's rank change
 */
export function getRankChangeText(book: BestsellerTableBook): string {
  if (book.isNew) return 'NEW';
  if (book.wasDropped) return 'DROP';
  if (book.previousRank) {
    const change = book.previousRank - book.rank;
    if (change > 0) return `+${change}`;
    if (change < 0) return `${change}`;
  }
  return '—';
}

/**
 * Get the CSS classes for a table row based on book status
 */
export function getRowClassName(book: BestsellerTableBook): string {
  if (book.isNew) {
    return 'bg-green-50 dark:bg-green-950/20 hover:bg-green-100 dark:hover:bg-green-950/30 border-t border-border transition-all';
  }
  if (book.wasDropped) {
    return 'bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30 border-t border-border transition-all';
  }
  return 'hover:bg-muted/50 border-t border-border transition-all';
}

/**
 * Sort books based on the selected sort order
 * For audience filtering, groups by status: adds first, remaining, then drops
 */
export function sortBooks(
  books: BestsellerTableBook[],
  sortBy: SortOrder,
  isAudienceFiltered: boolean
): BestsellerTableBook[] {
  const booksCopy = [...books];

  if (isAudienceFiltered) {
    // Group by status when audience filtered
    const adds = booksCopy.filter(book => book.isNew);
    const remaining = booksCopy.filter(book => !book.isNew && !book.wasDropped);
    const drops = booksCopy.filter(book => book.wasDropped);
    return [...adds, ...remaining, ...drops];
  }

  if (sortBy === 'title') {
    return booksCopy.sort((a, b) => {
      // Remove articles from beginning of titles for sorting
      const cleanTitle = (title: string) => title.replace(/^(A|An|The)\s+/i, '');
      return cleanTitle(a.title).localeCompare(cleanTitle(b.title));
    });
  }

  // Default order (by position/rank)
  return booksCopy;
}

/**
 * Clean a title for sorting by removing leading articles
 */
export function cleanTitleForSorting(title: string): string {
  return title.replace(/^(A|An|The)\s+/i, '');
}
