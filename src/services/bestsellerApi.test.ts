import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchBestsellerListFromDb } from './bestsellerApi';

// Chainable + thenable query builder (repo pattern): every method returns the
// builder, and awaiting it resolves the next queued response — so each test
// declares, in order, what each `.from('regional_bestsellers')` query returns.
const mockState = vi.hoisted(() => ({ queue: [] as Array<{ data: unknown; error: unknown }>, calls: [] as string[] }));

const supabaseClientMock = vi.hoisted(() => {
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) {
      builder[m] = vi.fn(() => builder);
    }
    builder.then = (resolve: (v: unknown) => unknown) => {
      const next = mockState.queue.shift() ?? { data: null, error: null };
      return Promise.resolve(next).then(resolve);
    };
    return builder;
  };
  return {
    from: vi.fn((table: string) => {
      mockState.calls.push(table);
      return makeBuilder();
    }),
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseClientMock }));

const row = (o: Partial<Record<string, unknown>> = {}) => ({
  isbn: '9780063511637',
  title: 'Whistler',
  author: 'Ann Patchett',
  publisher: 'Harper',
  price: '$30.00',
  rank: 1,
  category: 'HARDCOVER FICTION',
  last_week_rank: 2,
  weeks_on_list: 12,
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockState.queue = [];
  mockState.calls = [];
});

describe('fetchBestsellerListFromDb', () => {
  it('resolves the latest week with a limit-1 query when weekDate is omitted', async () => {
    mockState.queue = [
      { data: [{ week_date: '2026-09-02' }], error: null }, // latest-week
      { data: [row()], error: null },                        // current rows
      { data: [], error: null },                             // comparison rows
    ];
    const result = await fetchBestsellerListFromDb({ region: 'PNBA' });
    expect(result.weekDate).toBe('2026-09-02');
    expect(result.comparisonWeek).toBe('2026-08-26');
    // Exactly three queries — never a table scan.
    expect(mockState.calls).toHaveLength(3);
  });

  it('uses ABA last_week_rank for the default comparison week', async () => {
    mockState.queue = [
      { data: [row({ last_week_rank: 5 })], error: null },
      { data: [], error: null },
    ];
    const result = await fetchBestsellerListFromDb({
      region: 'PNBA',
      weekDate: '2026-09-02',
    });
    const book = result.current.categories[0].books[0];
    expect(book.previousRank).toBe(5);
    expect(book.isNew).toBe(false);
  });

  it('marks a book new when ABA last_week_rank is null (default comparison)', async () => {
    mockState.queue = [
      { data: [row({ last_week_rank: null })], error: null },
      { data: [], error: null },
    ];
    const result = await fetchBestsellerListFromDb({ region: 'PNBA', weekDate: '2026-09-02' });
    const book = result.current.categories[0].books[0];
    expect(book.previousRank).toBeUndefined();
    expect(book.isNew).toBe(true);
  });

  it('diffs against stored rows for a custom comparison week', async () => {
    mockState.queue = [
      { data: [row({ last_week_rank: 5 })], error: null }, // current
      { data: [row({ rank: 9, week_date: '2026-08-12' })], error: null }, // comparison
    ];
    const result = await fetchBestsellerListFromDb({
      region: 'PNBA',
      weekDate: '2026-09-02',
      comparisonWeek: '2026-08-12', // NOT weekDate - 7
    });
    const book = result.current.categories[0].books[0];
    // Stored comparison rank wins over ABA's one-week-back value.
    expect(book.previousRank).toBe(9);
    expect(book.isNew).toBe(false);
  });

  it('appends wasDropped entries from the comparison week', async () => {
    mockState.queue = [
      { data: [row()], error: null },
      {
        data: [
          row(), // still on the list
          row({ isbn: '9781954118812', title: 'The Calamity Club', rank: 3 }),
        ],
        error: null,
      },
    ];
    const result = await fetchBestsellerListFromDb({ region: 'PNBA', weekDate: '2026-09-02' });
    const books = result.current.categories[0].books;
    const dropped = books.find((b) => b.isbn === '9781954118812');
    expect(dropped?.wasDropped).toBe(true);
    expect(books.find((b) => b.isbn === '9780063511637')?.wasDropped).toBeUndefined();
  });

  it('coalesces null publisher/price to empty strings and keeps null weeks_on_list undefined', async () => {
    mockState.queue = [
      { data: [row({ publisher: null, price: null, weeks_on_list: null })], error: null },
      { data: [], error: null },
    ];
    const result = await fetchBestsellerListFromDb({ region: 'PNBA', weekDate: '2026-09-02' });
    const book = result.current.categories[0].books[0];
    expect(book.publisher).toBe('');
    expect(book.price).toBe('');
    expect(book.weeksOnList).toBeUndefined();
  });

  it('groups categories in display order with list metadata', async () => {
    mockState.queue = [
      {
        data: [
          row({ category: 'YOUNG ADULT', isbn: '9781665982412', title: 'Perks' }),
          row({ category: 'HARDCOVER FICTION' }),
        ],
        error: null,
      },
      { data: [], error: null },
    ];
    const result = await fetchBestsellerListFromDb({ region: 'PNBA', weekDate: '2026-09-02' });
    expect(result.current.title).toBe('PNBA Independent Bestsellers');
    expect(result.current.date).toBe('2026-09-02');
    expect(result.current.categories.map((c) => c.name)).toEqual([
      'HARDCOVER FICTION',
      'YOUNG ADULT',
    ]);
  });

  it('throws when the region has no data at all', async () => {
    mockState.queue = [{ data: [], error: null }];
    await expect(fetchBestsellerListFromDb({ region: 'PNBA' })).rejects.toThrow(
      /no bestseller data/i
    );
  });
});
