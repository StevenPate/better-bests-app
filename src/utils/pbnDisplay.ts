/**
 * PBN Display list definitions
 *
 * The store's physical bestseller displays follow the PNBA printable PDF:
 * the four adult lists plus Mass Market at 15 deep, and the children's/YA
 * lists at 10 deep. Children's Illustrated, Children's Titles, and
 * Children's Interest are not displayed.
 *
 * Adds and drops here are relative to the display window (top N), not the
 * full ABA list: a book climbing #12 -> #9 on a 10-deep list is an add, and
 * one slipping #8 -> #12 is a drop, even though the ABA list shows both as
 * ordinary moves.
 *
 * @module pbnDisplay
 */

import type { BestsellerBook, BestsellerCategory, BestsellerList } from '@/types/bestseller';

export interface PbnDisplayCategory {
  name: string;
  cutoff: number;
}

export interface PbnDisplaySection extends PbnDisplayCategory {
  adds: BestsellerBook[];
  drops: BestsellerBook[];
}

/** Categories shown on the store displays, in display order, with print depth. */
export const PBN_DISPLAY_CATEGORIES: PbnDisplayCategory[] = [
  { name: 'HARDCOVER FICTION', cutoff: 15 },
  { name: 'HARDCOVER NONFICTION', cutoff: 15 },
  { name: 'TRADE PAPERBACK FICTION', cutoff: 15 },
  { name: 'TRADE PAPERBACK NONFICTION', cutoff: 15 },
  { name: 'MASS MARKET', cutoff: 15 },
  { name: "CHILDREN'S SERIES TITLES", cutoff: 10 },
  { name: 'EARLY & MIDDLE GRADE READERS', cutoff: 10 },
  { name: 'YOUNG ADULT', cutoff: 10 },
];

/**
 * A book is a display add when it sits inside the cutoff this week but was
 * outside it (or off the list) last week. Books with unknown history
 * (untracked deep-list rows) are never adds.
 */
export function isPbnDisplayAdd(book: BestsellerBook, cutoff: number): boolean {
  if (book.wasDropped) return false;
  if (book.rank > cutoff) return false;
  if (book.previousRank === undefined) return book.isNew === true;
  return book.previousRank > cutoff;
}

/**
 * A book is a display drop when it was inside the cutoff last week but is
 * outside it now — whether it fell off the list entirely or just slipped
 * below the cutoff.
 */
export function isPbnDisplayDrop(book: BestsellerBook, cutoff: number): boolean {
  if (book.previousRank === undefined || book.previousRank > cutoff) return false;
  if (book.wasDropped) return true;
  return book.rank > cutoff;
}

/**
 * Split a bestseller list into PBN display sections: only the configured
 * categories, in display order, each with its cutoff-aware adds (sorted by
 * current rank) and drops (sorted by previous rank).
 */
export function collectPbnDisplaySections(list: BestsellerList): PbnDisplaySection[] {
  const byName = new Map<string, BestsellerCategory>(
    list.categories.map(category => [category.name, category])
  );

  return PBN_DISPLAY_CATEGORIES.flatMap(({ name, cutoff }) => {
    const category = byName.get(name);
    if (!category) return [];

    const adds = category.books
      .filter(book => isPbnDisplayAdd(book, cutoff))
      .sort((a, b) => a.rank - b.rank);
    const drops = category.books
      .filter(book => isPbnDisplayDrop(book, cutoff))
      .sort((a, b) => (a.previousRank ?? 0) - (b.previousRank ?? 0));

    return [{ name, cutoff, adds, drops }];
  });
}
