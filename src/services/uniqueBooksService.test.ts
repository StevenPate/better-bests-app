import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fetchUniqueBooks } from './uniqueBooksService';
import { ABA_REGION_CODES } from '@/config/abaRegions';

// Chainable + thenable query builder (repo pattern). Each builder records the
// filters applied to it, so a test can assert on HOW a query was narrowed and
// not just on what it returned.
const mockState = vi.hoisted(() => ({
  queue: [] as Array<{ data: unknown; error: unknown }>,
  queries: [] as Array<{ table: string; in: Array<[string, unknown]> }>,
}));

const supabaseClientMock = vi.hoisted(() => {
  const makeBuilder = (record: { in: Array<[string, unknown]> }) => {
    const builder: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'range', 'not', 'neq']) {
      builder[m] = vi.fn(() => builder);
    }
    builder.in = vi.fn((col: string, vals: unknown) => {
      record.in.push([col, vals]);
      return builder;
    });
    builder.then = (resolve: (v: unknown) => unknown) => {
      const next = mockState.queue.shift() ?? { data: [], error: null };
      return Promise.resolve(next).then(resolve);
    };
    return builder;
  };
  return {
    from: vi.fn((table: string) => {
      const record = { table, in: [] as Array<[string, unknown]> };
      mockState.queries.push(record);
      return makeBuilder(record);
    }),
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseClientMock }));

beforeEach(() => {
  vi.clearAllMocks();
  mockState.queue = [];
  mockState.queries = [];
});

describe('fetchUniqueBooks region fencing', () => {
  it('narrows the cross-region lookup to ABA regions only', async () => {
    // Page 1: one book on the target region's list. Page 2: empty, ends paging.
    mockState.queue = [
      { data: [{ isbn: '9781000000001', title: 'T', author: 'A', publisher: 'P', rank: 1, category: 'FICTION', week_date: '2026-09-23' }], error: null },
      { data: [], error: null },
      // the cross-region map query, then its terminating empty page
      { data: [], error: null },
      { data: [], error: null },
    ];

    await fetchUniqueBooks('PNBA');

    // The query that asks "where else has this ISBN charted" must be fenced.
    // Without `.in('region', ABA_REGION_CODES)` an IPC row would count as
    // another region and the book would stop looking unique.
    const regionFilters = mockState.queries.flatMap((q) =>
      q.in.filter(([col]) => col === 'region').map(([, vals]) => vals)
    );

    expect(regionFilters.length).toBeGreaterThan(0);
    for (const vals of regionFilters) {
      expect(vals).toEqual(ABA_REGION_CODES);
      expect(vals).not.toContain('IPC');
    }
  });
});
