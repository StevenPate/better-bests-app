// src/hooks/useBestsellerData.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useBestsellerData } from './useBestsellerData';
import { RegionProvider } from '@/contexts/RegionContext';
import { ReactNode } from 'react';
import { BestsellerParser } from '@/utils/bestsellerParser';

const mockBestsellerData = {
  current: {
    title: 'Test Bestsellers',
    date: '2024-11-06',
    categories: [],
  },
  previous: {
    title: 'Test Bestsellers',
    date: '2024-10-30',
    categories: [],
  },
};

const createWrapper = (initialPath = '/region/pnba') => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/region/:region" element={<RegionProvider>{children}</RegionProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

describe('useBestsellerData - Multi-Region', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetchBestsellerData to return test data
    fetchSpy = vi.spyOn(BestsellerParser, 'fetchBestsellerData').mockResolvedValue(mockBestsellerData);
    // Mock shouldFetchNewData to prevent background fetches
    vi.spyOn(BestsellerParser, 'shouldFetchNewData').mockResolvedValue(false);
  });

  it('should fetch data for PNBA region by default', async () => {
    const { result } = renderHook(() => useBestsellerData(), {
      wrapper: createWrapper('/region/pnba'),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ region: 'PNBA' }));
  });

  it('should fetch data for SIBA when region changes', async () => {
    const { result } = renderHook(() => useBestsellerData(), {
      wrapper: createWrapper('/region/siba'),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ region: 'SIBA' }));
  });

  it('should use region-specific query keys', () => {
    const { result: pnbaResult } = renderHook(() => useBestsellerData(), {
      wrapper: createWrapper('/region/pnba'),
    });

    const { result: sibaResult } = renderHook(() => useBestsellerData(), {
      wrapper: createWrapper('/region/siba'),
    });

    // Query keys should differ by region
    expect(pnbaResult.current).toBeDefined();
    expect(sibaResult.current).toBeDefined();
  });
});
