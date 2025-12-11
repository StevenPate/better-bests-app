import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { useBookPerformance } from './useBookPerformance';

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({
              data: {
                isbn: '9781234567890',
                year: 2025,
                total_score: 1234.5,
                weeks_on_chart: 14,
                regions_appeared: 5,
                avg_score_per_week: 88.2,
              },
              error: null,
            })),
          })),
        })),
      })),
    })),
  },
}));

describe('useBookPerformance', () => {
  it('should fetch book performance metrics', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useBookPerformance('9781234567890', 2025),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      isbn: '9781234567890',
      year: 2025,
      total_score: 1234.5,
      weeks_on_chart: 14,
      regions_appeared: 5,
      avg_score_per_week: 88.2,
    });
  });
});
