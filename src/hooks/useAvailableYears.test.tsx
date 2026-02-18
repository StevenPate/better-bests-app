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

import { useAvailableYears } from './useAvailableYears';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useAvailableYears', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Two queries: first ordered asc limit 1, second ordered desc limit 1
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      const builder: any = {};
      builder.select = vi.fn(() => builder);
      builder.order = vi.fn(() => {
        callCount++;
        const isAsc = callCount === 1;
        return {
          ...builder,
          limit: vi.fn(() => Promise.resolve({
            data: [{ week_date: isAsc ? '2025-01-08' : '2026-02-11' }],
            error: null,
          })),
        };
      });
      return builder;
    });
  });

  it('should return year range from earliest to latest week_date', async () => {
    const { result } = renderHook(() => useAvailableYears(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([2025, 2026]);
  });
});
