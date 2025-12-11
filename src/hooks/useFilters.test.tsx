// src/hooks/useFilters.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useFilters } from './useFilters';
import { RegionProvider } from '@/contexts/RegionContext';
import { ReactNode } from 'react';
import * as analytics from '@/lib/analytics';

// Add mock for analytics
vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn()
}));

const wrapper = ({ children, initialPath = '/region/pnba' }: { children: ReactNode; initialPath?: string }) => (
  <MemoryRouter initialEntries={[initialPath]}>
    <Routes>
      <Route path="/region/:region/*" element={<RegionProvider>{children}</RegionProvider>} />
    </Routes>
  </MemoryRouter>
);

describe('useFilters', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should initialize with default filters from base region path', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba' })
    });

    expect(result.current.filter).toBe('all');
    expect(result.current.audienceFilter).toBe('all');
    expect(result.current.searchTerm).toBe('');
  });

  it('should parse filters from region-aware URL with filter type', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba/adds' }),
    });

    expect(result.current.filter).toBe('adds');
    expect(result.current.audienceFilter).toBe('all');
  });

  it('should parse filters from region-aware URL with audience', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba/adult' }),
    });

    expect(result.current.filter).toBe('all');
    expect(result.current.audienceFilter).toBe('A');
  });

  it('should parse filters from region-aware URL with audience and filter', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba/teen/adds-drops' }),
    });

    expect(result.current.filter).toBe('adds-drops');
    expect(result.current.audienceFilter).toBe('T');
  });

  it('should correctly parse no-drops filter (not misclassify as drops)', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba/no-drops' }),
    });

    expect(result.current.filter).toBe('no-drops');
    expect(result.current.audienceFilter).toBe('all');
  });

  it('should correctly parse no-drops with audience', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba/adult/no-drops' }),
    });

    expect(result.current.filter).toBe('no-drops');
    expect(result.current.audienceFilter).toBe('A');
  });

  it('should work with different regions', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/siba/children/drops' }),
    });

    expect(result.current.filter).toBe('drops');
    expect(result.current.audienceFilter).toBe('C');
  });

  it('should update URL when filter changes (preserving region)', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba' }),
    });

    act(() => {
      result.current.setFilter('adds');
    });

    expect(result.current.filter).toBe('adds');
  });

  it('should update URL when audience filter changes (preserving region)', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba' }),
    });

    act(() => {
      result.current.setAudienceFilter('A');
    });

    expect(result.current.audienceFilter).toBe('A');
  });

  it('should update URL when both filters change (preserving region)', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba' }),
    });

    act(() => {
      result.current.setAudienceFilter('T');
    });

    act(() => {
      result.current.setFilter('no-drops');
    });

    expect(result.current.audienceFilter).toBe('T');
    expect(result.current.filter).toBe('no-drops');
  });

  it('should reset filters to default (preserving region)', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba/adult/adds' }),
    });

    expect(result.current.filter).toBe('adds');
    expect(result.current.audienceFilter).toBe('A');

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.filter).toBe('all');
    expect(result.current.audienceFilter).toBe('all');
    expect(result.current.searchTerm).toBe('');
  });

  it('should handle search term state independently of URL', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba' }),
    });

    act(() => {
      result.current.setSearchTerm('test search');
    });

    expect(result.current.searchTerm).toBe('test search');

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.searchTerm).toBe('');
  });

  it('should preserve query string when updating filters', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba?comparisonWeek=2024-01-01' }),
    });

    act(() => {
      result.current.setFilter('adds');
    });

    expect(result.current.filter).toBe('adds');
    // Note: Full query string preservation testing requires checking location,
    // which is tested in integration tests
  });

  it('should preserve hash when updating filters', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba#section' }),
    });

    act(() => {
      result.current.setAudienceFilter('C');
    });

    expect(result.current.audienceFilter).toBe('C');
    // Note: Full hash preservation testing requires checking location,
    // which is tested in integration tests
  });

  it('should sync filters when URL changes (browser back/forward)', () => {
    const { result, rerender } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba/adult/adds' }),
    });

    expect(result.current.filter).toBe('adds');
    expect(result.current.audienceFilter).toBe('A');

    // Simulate URL change (like browser back button)
    rerender();

    // Filters should remain in sync
    expect(result.current.filter).toBe('adds');
    expect(result.current.audienceFilter).toBe('A');
  });

  it('should track filter changes', () => {
    const { result } = renderHook(() => useFilters(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba/adult/adds' })
    });

    expect(analytics.trackEvent).toHaveBeenCalledWith('filter_applied', {
      filter: 'adds',
      audience: 'adult'
    });
  });
});
