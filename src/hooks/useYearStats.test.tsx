import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.gte = vi.fn(() => builder);
  builder.lt = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve({
    data: [
      { week_date: '2026-01-07', isbn: '978-0-11-111111-1' },
      { week_date: '2026-01-07', isbn: '978-0-22-222222-2' },
      { week_date: '2026-01-14', isbn: '978-0-11-111111-1' },
      { week_date: '2026-01-14', isbn: '978-0-33-333333-3' },
      { week_date: '2026-01-21', isbn: '978-0-11-111111-1' },
      { week_date: '2026-01-21', isbn: '978-0-22-222222-2' },
      { week_date: '2026-01-21', isbn: '978-0-44-444444-4' },
    ],
    error: null,
  }));
  return {
    supabase: {
      from: vi.fn(() => builder),
    },
  };
});

import { useYearStats } from './useYearStats';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useYearStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return week count and book count for a year', async () => {
    const { result } = renderHook(() => useYearStats(2026), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // 3 unique weeks, 4 unique ISBNs
    expect(result.current.data).toEqual({ weeksOfData: 3, totalBooks: 4 });
  });
});
