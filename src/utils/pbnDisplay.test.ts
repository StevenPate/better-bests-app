import { describe, it, expect } from 'vitest';
import {
  PBN_DISPLAY_CATEGORIES,
  isPbnDisplayAdd,
  isPbnDisplayDrop,
  collectPbnDisplaySections,
} from './pbnDisplay';
import type { BestsellerBook, BestsellerList } from '@/types/bestseller';

const makeBook = (overrides: Partial<BestsellerBook> = {}): BestsellerBook => ({
  rank: 1,
  title: 'Sample Title',
  author: 'Sample Author',
  publisher: 'Sample Publisher',
  price: '$10.00',
  isbn: '9780000000000',
  ...overrides,
});

describe('PBN_DISPLAY_CATEGORIES', () => {
  it('uses the PNBA print categories plus Mass Market, at print depth', () => {
    expect(PBN_DISPLAY_CATEGORIES).toEqual([
      { name: 'HARDCOVER FICTION', cutoff: 15 },
      { name: 'HARDCOVER NONFICTION', cutoff: 15 },
      { name: 'TRADE PAPERBACK FICTION', cutoff: 15 },
      { name: 'TRADE PAPERBACK NONFICTION', cutoff: 15 },
      { name: 'MASS MARKET', cutoff: 15 },
      { name: "CHILDREN'S SERIES TITLES", cutoff: 10 },
      { name: 'EARLY & MIDDLE GRADE READERS', cutoff: 10 },
      { name: 'YOUNG ADULT', cutoff: 10 },
    ]);
  });

  it("excludes Children's Illustrated, Children's Titles, and Children's Interest", () => {
    const names = PBN_DISPLAY_CATEGORIES.map(c => c.name);
    expect(names).not.toContain("CHILDREN'S ILLUSTRATED");
    expect(names).not.toContain("CHILDREN'S TITLES");
    expect(names).not.toContain("CHILDREN'S INTEREST");
  });
});

describe('isPbnDisplayAdd', () => {
  it('counts a debut inside the cutoff as an add', () => {
    const book = makeBook({ rank: 3, isNew: true });
    expect(isPbnDisplayAdd(book, 10)).toBe(true);
  });

  it('counts a climb from below the cutoff into it as an add', () => {
    const book = makeBook({ rank: 9, previousRank: 12 });
    expect(isPbnDisplayAdd(book, 10)).toBe(true);
  });

  it('does not count an ordinary move within the cutoff as an add', () => {
    const book = makeBook({ rank: 9, previousRank: 12 });
    expect(isPbnDisplayAdd(book, 15)).toBe(false);
  });

  it('does not count a debut below the cutoff as an add', () => {
    const book = makeBook({ rank: 11, isNew: true });
    expect(isPbnDisplayAdd(book, 10)).toBe(false);
  });

  it('does not count an untracked book with unknown history as an add', () => {
    // ABA leaves momentum blank on untracked deep-list rows: unknown, not new
    const book = makeBook({ rank: 12, previousRank: undefined, isNew: false });
    expect(isPbnDisplayAdd(book, 15)).toBe(false);
  });

  it('never counts a dropped book as an add', () => {
    const book = makeBook({ rank: 2, previousRank: 2, wasDropped: true });
    expect(isPbnDisplayAdd(book, 10)).toBe(false);
  });
});

describe('isPbnDisplayDrop', () => {
  it('counts a book that fell off the list from inside the cutoff as a drop', () => {
    const book = makeBook({ rank: 8, previousRank: 8, wasDropped: true });
    expect(isPbnDisplayDrop(book, 10)).toBe(true);
  });

  it('does not count a book that fell off from below the cutoff as a drop', () => {
    const book = makeBook({ rank: 12, previousRank: 12, wasDropped: true });
    expect(isPbnDisplayDrop(book, 10)).toBe(false);
  });

  it('counts a slip from inside the cutoff to below it as a drop', () => {
    const book = makeBook({ rank: 12, previousRank: 8 });
    expect(isPbnDisplayDrop(book, 10)).toBe(true);
  });

  it('does not count a move entirely below the cutoff as a drop', () => {
    const book = makeBook({ rank: 12, previousRank: 11 });
    expect(isPbnDisplayDrop(book, 10)).toBe(false);
  });

  it('does not count a book still inside the cutoff as a drop', () => {
    const book = makeBook({ rank: 10, previousRank: 3 });
    expect(isPbnDisplayDrop(book, 10)).toBe(false);
  });
});

describe('collectPbnDisplaySections', () => {
  const list: BestsellerList = {
    title: 'PNBA',
    date: '2026-09-09',
    categories: [
      {
        name: "CHILDREN'S ILLUSTRATED",
        books: [makeBook({ isbn: '9780000000901', isNew: true })],
      },
      {
        name: 'EARLY & MIDDLE GRADE READERS',
        books: [
          makeBook({ isbn: '9780000000001', rank: 9, previousRank: 12, title: 'Climber' }),
          makeBook({ isbn: '9780000000002', rank: 2, isNew: true, title: 'Debut' }),
          makeBook({ isbn: '9780000000003', rank: 5, previousRank: 4, title: 'Steady' }),
          makeBook({ isbn: '9780000000004', rank: 12, previousRank: 8, title: 'Slipped' }),
          makeBook({ isbn: '9780000000005', rank: 6, previousRank: 6, wasDropped: true, title: 'Gone' }),
        ],
      },
      {
        name: 'HARDCOVER FICTION',
        books: [makeBook({ isbn: '9780000000101', rank: 1, isNew: true, title: 'HC Debut' })],
      },
    ],
  };

  it('returns only configured categories, in display order', () => {
    const sections = collectPbnDisplaySections(list);
    expect(sections.map(s => s.name)).toEqual([
      'HARDCOVER FICTION',
      'EARLY & MIDDLE GRADE READERS',
    ]);
  });

  it('splits each category into cutoff-aware adds and drops', () => {
    const sections = collectPbnDisplaySections(list);
    const early = sections.find(s => s.name === 'EARLY & MIDDLE GRADE READERS')!;
    expect(early.cutoff).toBe(10);
    expect(early.adds.map(b => b.title)).toEqual(['Debut', 'Climber']);
    expect(early.drops.map(b => b.title)).toEqual(['Gone', 'Slipped']);
  });

  it('sorts adds by current rank and drops by previous rank', () => {
    const sections = collectPbnDisplaySections(list);
    const early = sections.find(s => s.name === 'EARLY & MIDDLE GRADE READERS')!;
    expect(early.adds.map(b => b.rank)).toEqual([2, 9]);
    expect(early.drops.map(b => b.previousRank)).toEqual([6, 8]);
  });
});
