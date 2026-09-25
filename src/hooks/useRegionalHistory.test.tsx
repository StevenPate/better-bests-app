// src/hooks/useRegionalHistory.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRegionalHistory } from './useRegionalHistory';
import type { ReactNode } from 'react';

// Mock Supabase client.
//
// Chainable builder rather than a fixed select->eq->gte->order nest: every
// filter method returns the builder and the builder itself carries the result,
// so adding or reordering a filter in the hook does not break this mock. (It
// broke once when the ABA region fence added .in('region', ...).)
const HISTORY_ROWS = [
  {
    region: 'PNBA',
    week_date: '2025-01-15',
    rank: 3,
    category: 'Fiction',
    list_title: 'Fiction',
  },
  {
    region: 'SIBA',
    week_date: '2025-01-15',
    rank: 5,
    category: 'Fiction',
    list_title: 'Southern Fiction',
  },
];

vi.mock('@/integrations/supabase/client', () => {
  const makeBuilder = () => {
    const builder: Record<string, unknown> = { data: HISTORY_ROWS, error: null };
    for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'neq', 'not', 'order', 'limit', 'range']) {
      builder[m] = () => builder;
    }
    return builder;
  };
  return { supabase: { from: () => makeBuilder() } };
});

describe('useRegionalHistory', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('should fetch regional history data', async () => {
    const { result } = renderHook(
      () => useRegionalHistory({ isbn: '9780000000000', weeks: 52 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBeDefined();
    expect(result.current.data?.size).toBe(2); // PNBA and SIBA
    expect(result.current.error).toBeNull();
  });

  it('should group data by region', async () => {
    const { result } = renderHook(
      () => useRegionalHistory({ isbn: '9780000000000', weeks: 52 }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const pnbaData = result.current.data?.get('PNBA');
    expect(pnbaData).toHaveLength(1);
    expect(pnbaData?.[0].rank).toBe(3);

    const sibaData = result.current.data?.get('SIBA');
    expect(sibaData).toHaveLength(1);
    expect(sibaData?.[0].rank).toBe(5);
  });

  it('should return null data when loading', () => {
    const { result } = renderHook(
      () => useRegionalHistory({ isbn: '9780000000000', weeks: 52 }),
      { wrapper }
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
  });
});
