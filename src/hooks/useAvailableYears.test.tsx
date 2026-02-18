import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

vi.mock('@/integrations/supabase/client', () => {
  const builder: any = {};
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => Promise.resolve({
    data: [
      { week_date: '2025-01-08' },
      { week_date: '2025-06-15' },
      { week_date: '2026-01-07' },
      { week_date: '2026-02-11' },
    ],
    error: null,
  }));
  return {
    supabase: {
      from: vi.fn(() => builder),
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
  beforeEach(() => vi.clearAllMocks());

  it('should return sorted array of available years from weekly_scores', async () => {
    const { result } = renderHook(() => useAvailableYears(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([2025, 2026]);
  });
});
