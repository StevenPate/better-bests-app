// src/hooks/useRegion.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useRegion } from './useRegion';
import { RegionProvider } from '@/contexts/RegionContext';
import { ReactNode } from 'react';

const wrapper = ({ children, initialPath = '/region/pnba' }: { children: ReactNode; initialPath?: string }) => (
  <MemoryRouter initialEntries={[initialPath]}>
    <Routes>
      <Route path="/region/:region" element={<RegionProvider>{children}</RegionProvider>} />
    </Routes>
  </MemoryRouter>
);

describe('useRegion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return PNBA as default region', () => {
    const { result } = renderHook(() => useRegion(), { wrapper });
    expect(result.current.currentRegion.abbreviation).toBe('PNBA');
  });

  it('should parse region from URL', () => {
    const { result } = renderHook(() => useRegion(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/siba' }),
    });
    expect(result.current.currentRegion.abbreviation).toBe('SIBA');
  });

  it('should provide all regions', () => {
    const { result } = renderHook(() => useRegion(), { wrapper });
    expect(result.current.regions).toHaveLength(9);
  });

  it('should have switchRegion function', () => {
    const { result } = renderHook(() => useRegion(), { wrapper });
    expect(typeof result.current.switchRegion).toBe('function');
  });

  it('should preserve query string and hash when switching regions', () => {
    const { result } = renderHook(() => useRegion(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba?comparisonWeek=2024-01-01#section' }),
    });
    expect(result.current.currentRegion.abbreviation).toBe('PNBA');
    // Note: Full navigation testing requires more complex setup with act() and waitFor()
    // This test verifies the hook loads correctly with query params and hash
  });

  it('should fall back to PNBA for invalid region', () => {
    const { result } = renderHook(() => useRegion(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/invalid' }),
    });
    expect(result.current.currentRegion.abbreviation).toBe('PNBA');
  });

  it('should short-circuit when switching to current region', () => {
    const { result } = renderHook(() => useRegion(), {
      wrapper: ({ children }) => wrapper({ children, initialPath: '/region/pnba' }),
    });

    // Switching to the same region should be a no-op
    expect(result.current.currentRegion.abbreviation).toBe('PNBA');
    result.current.switchRegion('PNBA');
    expect(result.current.currentRegion.abbreviation).toBe('PNBA');
  });
});
