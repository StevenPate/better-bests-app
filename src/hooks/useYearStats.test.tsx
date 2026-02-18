import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => {
  return {
    supabase: {
      from: (...args: any[]) => mockFrom(...args),
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
  beforeEach(() => {
    vi.clearAllMocks();

    // weekly_scores queries: first asc limit 1, then desc limit 1
    let weeklyCallCount = 0;
    const createWeeklyBuilder = () => {
      const builder: any = {};
      builder.select = vi.fn(() => builder);
      builder.gte = vi.fn(() => builder);
      builder.lt = vi.fn(() => builder);
      builder.order = vi.fn(() => {
        weeklyCallCount++;
        const isAsc = weeklyCallCount % 2 === 1;
        return {
          ...builder,
          limit: vi.fn(() => Promise.resolve({
            data: [{ week_date: isAsc ? '2026-01-07' : '2026-02-18' }],
            error: null,
          })),
        };
      });
      return builder;
    };

    // book_performance_metrics count query (returns count in header, no data)
    const createMetricsBuilder = () => {
      const builder: any = {};
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => Promise.resolve({
        data: null,
        error: null,
        count: 423,
      }));
      return builder;
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'weekly_scores') return createWeeklyBuilder();
      if (table === 'book_performance_metrics') return createMetricsBuilder();
      return createWeeklyBuilder();
    });
  });

  it('should return week count from date range and book count from metrics', async () => {
    const { result } = renderHook(() => useYearStats(2026), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Jan 7 to Feb 18 = 6 weeks + 1 = 7 weeks
    expect(result.current.data).toEqual({ weeksOfData: 7, totalBooks: 423 });
  });
});
