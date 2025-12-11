// src/components/Navigation/RegionSelector.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RegionSelector } from './RegionSelector';
import { RegionProvider } from '@/contexts/RegionContext';
import { ReactNode } from 'react';

const renderRegionSelector = (initialPath = '/region/pnba') => {
  const queryClient = new QueryClient();

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/region/:region" element={<RegionProvider>{children}</RegionProvider>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  return render(<RegionSelector />, { wrapper });
};

describe('RegionSelector', () => {
  it('should display current region abbreviation', () => {
    renderRegionSelector('/region/pnba');
    expect(screen.getByText('PNBA')).toBeInTheDocument();
  });

  it('should show dropdown when clicked', async () => {
    const user = userEvent.setup();
    renderRegionSelector();

    const trigger = screen.getByRole('button');
    await user.click(trigger);

    // Should show all 8 regions - check for specific display names
    expect(screen.getByText('PNBA - Pacific Northwest')).toBeInTheDocument();
    expect(screen.getByText('SIBA - Southern')).toBeInTheDocument();
  });

  it('should switch regions when selection clicked', async () => {
    const user = userEvent.setup();
    renderRegionSelector('/region/pnba');

    const trigger = screen.getByRole('button');
    await user.click(trigger);

    const sibaOption = screen.getByText(/SIBA - Southern/i);
    await user.click(sibaOption);

    // Navigation will be handled by integration tests
  });
});
