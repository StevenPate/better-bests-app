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

    // Mock weekly_scores query (week count)
    const weekBuilder: any = {};
    weekBuilder.select = vi.fn(() => weekBuilder);
    weekBuilder.eq = vi.fn(() => weekBuilder);
    weekBuilder.gte = vi.fn(() => weekBuilder);
    weekBuilder.lt = vi.fn(() => Promise.resolve({
      data: [
        { week_date: '2026-01-07' },
        { week_date: '2026-01-14' },
        { week_date: '2026-01-21' },
        { week_date: '2026-01-28' },
        { week_date: '2026-02-04' },
        { week_date: '2026-02-11' },
        { week_date: '2026-02-18' },
      ],
      error: null,
    }));

    // Mock book_performance_metrics query (book count)
    const bookBuilder: any = {};
    bookBuilder.select = vi.fn(() => bookBuilder);
    bookBuilder.eq = vi.fn(() => Promise.resolve({
      data: Array.from({ length: 423 }, (_, i) => ({ isbn: `isbn-${i}` })),
      error: null,
    }));

    mockFrom.mockImplementation((table: string) => {
      if (table === 'weekly_scores') return weekBuilder;
      if (table === 'book_performance_metrics') return bookBuilder;
      return weekBuilder;
    });
  });

  it('should return week count and book count for a year', async () => {
    const { result } = renderHook(() => useYearStats(2026), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ weeksOfData: 7, totalBooks: 423 });
  });
});
