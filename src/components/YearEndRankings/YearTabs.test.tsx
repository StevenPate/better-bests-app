import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { YearTabs } from './YearTabs';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('YearTabs', () => {
  it('should render a tab for each available year', () => {
    render(
      <MemoryRouter>
        <YearTabs availableYears={[2025, 2026]} currentYear={2026} />
      </MemoryRouter>
    );

    expect(screen.getByRole('tab', { name: '2025' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2026' })).toBeInTheDocument();
  });

  it('should highlight the current year tab', () => {
    render(
      <MemoryRouter>
        <YearTabs availableYears={[2025, 2026]} currentYear={2026} />
      </MemoryRouter>
    );

    const activeTab = screen.getByRole('tab', { name: '2026' });
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('should navigate when clicking a different year tab', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <YearTabs availableYears={[2025, 2026]} currentYear={2026} />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('tab', { name: '2025' }));
    expect(mockNavigate).toHaveBeenCalledWith('/review/2025');
  });
});
