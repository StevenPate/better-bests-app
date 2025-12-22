import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MainNav } from './MainNav';
import { useAuth } from '@/hooks/useAuth';
import { useRegion } from '@/hooks/useRegion';

// Mock hooks and components
vi.mock('@/hooks/useAuth');
vi.mock('@/hooks/useRegion');
vi.mock('./RegionSelector', () => ({
  RegionSelector: () => <div data-testid="region-selector">Region Selector</div>,
}));
vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">Theme Toggle</div>,
}));
vi.mock('./FilterAndExportControls', () => ({
  FilterAndExportControls: () => <div data-testid="filter-export-controls">Filter & Export Controls</div>,
}));

const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockUseRegion = useRegion as ReturnType<typeof vi.fn>;

describe('MainNav', () => {
  const mockSignOut = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAuth.mockReturnValue({
      user: null,
      signOut: mockSignOut,
      isPbnStaff: false,
      isLoading: false,
    });

    mockUseRegion.mockReturnValue({
      currentRegion: {
        abbreviation: 'PNBA',
        fullName: 'Pacific Northwest Booksellers Association',
        regionCode: 'pn',
      },
      setCurrentRegion: vi.fn(),
    });
  });

  describe('Core Components', () => {
    it('should render RegionSelector component', () => {
      render(
        <MemoryRouter>
          <MainNav />
        </MemoryRouter>
      );

      expect(screen.getByTestId('region-selector')).toBeInTheDocument();
    });

    it('should render ThemeToggle component', () => {
      render(
        <MemoryRouter>
          <MainNav />
        </MemoryRouter>
      );

      expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have navigation roles', () => {
      render(
        <MemoryRouter>
          <MainNav />
        </MemoryRouter>
      );

      const navElements = screen.getAllByRole('navigation');
      expect(navElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Navigation Links', () => {
    it('should render "Current" link', () => {
      render(
        <MemoryRouter>
          <MainNav />
        </MemoryRouter>
      );

      const currentLink = screen.getByRole('link', { name: /^current$/i });
      expect(currentLink).toBeInTheDocument();
      expect(currentLink).toHaveAttribute('href', '/region/pnba');
    });

    it('should render "Elsewhere" link', () => {
      render(
        <MemoryRouter>
          <MainNav />
        </MemoryRouter>
      );

      const elsewhereLink = screen.getByRole('link', { name: /^elsewhere$/i });
      expect(elsewhereLink).toBeInTheDocument();
      expect(elsewhereLink).toHaveAttribute('href', '/region/pnba/elsewhere');
    });

    it('should render "Unique" link', () => {
      render(
        <MemoryRouter>
          <MainNav />
        </MemoryRouter>
      );

      const uniqueLink = screen.getByRole('link', { name: /^unique$/i });
      expect(uniqueLink).toBeInTheDocument();
      expect(uniqueLink).toHaveAttribute('href', '/region/pnba/unique');
    });

    it('should highlight "Current" for any region sub-route', () => {
      const { rerender } = render(
        <MemoryRouter initialEntries={['/region/pnba']}>
          <MainNav />
        </MemoryRouter>
      );

      const currentLink = screen.getByRole('link', { name: /^current$/i });
      expect(currentLink).toHaveClass('bg-gradient-primary');

      // Should still be highlighted on sub-routes
      rerender(
        <MemoryRouter initialEntries={['/region/pnba/adds']}>
          <MainNav />
        </MemoryRouter>
      );
      expect(screen.getByRole('link', { name: /^current$/i })).toHaveClass('bg-gradient-primary');

      // And on book detail pages
      rerender(
        <MemoryRouter initialEntries={['/region/pnba/book/9780123456789']}>
          <MainNav />
        </MemoryRouter>
      );
      expect(screen.getByRole('link', { name: /^current$/i })).toHaveClass('bg-gradient-primary');
    });

    it('should highlight active "Elsewhere" link', () => {
      render(
        <MemoryRouter initialEntries={['/region/pnba/elsewhere']}>
          <MainNav />
        </MemoryRouter>
      );

      const elsewhereLink = screen.getByRole('link', { name: /^elsewhere$/i });
      expect(elsewhereLink).toHaveClass('bg-gradient-primary');
    });

    it('should highlight active "Unique" link', () => {
      render(
        <MemoryRouter initialEntries={['/region/pnba/unique']}>
          <MainNav />
        </MemoryRouter>
      );

      const uniqueLink = screen.getByRole('link', { name: /^unique$/i });
      expect(uniqueLink).toHaveClass('bg-gradient-primary');
    });

    it('should update "Current" link when region changes', () => {
      mockUseRegion.mockReturnValue({
        currentRegion: {
          abbreviation: 'SIBA',
          fullName: 'Southern Independent Booksellers Alliance',
          regionCode: 'se',
        },
        setCurrentRegion: vi.fn(),
      });

      render(
        <MemoryRouter>
          <MainNav />
        </MemoryRouter>
      );

      const currentLink = screen.getByRole('link', { name: /^current$/i });
      expect(currentLink).toHaveAttribute('href', '/region/siba');
    });

    it('should not highlight "Current" when on "Unique" page', () => {
      render(
        <MemoryRouter initialEntries={['/region/pnba/unique']}>
          <MainNav />
        </MemoryRouter>
      );

      const currentLink = screen.getByRole('link', { name: /^current$/i });
      const uniqueLink = screen.getByRole('link', { name: /^unique$/i });

      // Current should NOT be highlighted
      expect(currentLink).not.toHaveClass('bg-gradient-primary');
      expect(currentLink).toHaveClass('text-muted-foreground');

      // Unique should be highlighted
      expect(uniqueLink).toHaveClass('bg-gradient-primary');
      expect(uniqueLink).toHaveClass('text-white');
    });

    it('should not highlight "Current" when on "Elsewhere" page', () => {
      render(
        <MemoryRouter initialEntries={['/region/pnba/elsewhere']}>
          <MainNav />
        </MemoryRouter>
      );

      const currentLink = screen.getByRole('link', { name: /^current$/i });
      const elsewhereLink = screen.getByRole('link', { name: /^elsewhere$/i });

      // Current should NOT be highlighted
      expect(currentLink).not.toHaveClass('bg-gradient-primary');
      expect(currentLink).toHaveClass('text-muted-foreground');

      // Elsewhere should be highlighted
      expect(elsewhereLink).toHaveClass('bg-gradient-primary');
      expect(elsewhereLink).toHaveClass('text-white');
    });
  });
});
