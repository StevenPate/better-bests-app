import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MobileNav } from './MobileNav';
import { useAuth } from '@/hooks/useAuth';
import { useRegion } from '@/hooks/useRegion';
import userEvent from '@testing-library/user-event';

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

describe('MobileNav', () => {
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

  describe('Core Elements', () => {
    it('should render menu button', () => {
      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
    });

    it('should have navigation role', () => {
      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  describe('Menu Drawer', () => {
    it('should open drawer when menu button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      });
    });

    it('should show RegionSelector in drawer', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      await waitFor(() => {
        expect(screen.getByTestId('region-selector')).toBeInTheDocument();
      });
    });

    it('should show FilterAndExportControls in drawer', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      await waitFor(() => {
        expect(screen.getByTestId('filter-export-controls')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label on menu button', () => {
      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      expect(menuButton).toHaveAttribute('aria-label', 'Open menu');
    });

    it('should have accessible drawer with proper roles', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(screen.getByText('Menu')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation Links in Drawer', () => {
    it('should render "Current" link in drawer', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      // Wait for drawer to open first
      await screen.findByRole('dialog');

      // Then find the link
      const currentLink = await screen.findByRole('link', { name: /^current$/i });
      expect(currentLink).toBeInTheDocument();
      expect(currentLink).toHaveAttribute('href', '/region/pnba');
    });

    it('should render "Elsewhere" link in drawer', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      // Wait for drawer to open first
      await screen.findByRole('dialog');

      // Then find the link (region-specific href)
      const elsewhereLink = await screen.findByRole('link', { name: /^elsewhere$/i });
      expect(elsewhereLink).toBeInTheDocument();
      expect(elsewhereLink).toHaveAttribute('href', '/region/pnba/elsewhere');
    });

    it('should render "Unique" link in drawer', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      // Wait for drawer to open first
      await screen.findByRole('dialog');

      // Then find the link
      const uniqueLink = await screen.findByRole('link', { name: /^unique$/i });
      expect(uniqueLink).toBeInTheDocument();
      expect(uniqueLink).toHaveAttribute('href', '/region/pnba/unique');
    });

    it('should close drawer when clicking "Current" link', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      // Open drawer
      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      // Wait for drawer and find link
      await screen.findByRole('dialog');
      const currentLink = await screen.findByRole('link', { name: /^current$/i });

      // Click Current
      await user.click(currentLink);

      // Drawer should close
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('should highlight "Current" when inside region section', async () => {
      const user = userEvent.setup();

      const { rerender } = render(
        <MemoryRouter initialEntries={['/region/pnba']}>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      // Wait for drawer and find link
      await screen.findByRole('dialog');
      const currentLink = await screen.findByRole('link', { name: /^current$/i });

      expect(currentLink).toHaveAttribute('href', '/region/pnba');
      expect(currentLink).toHaveClass('bg-gradient-primary');
      expect(currentLink).toHaveClass('shadow-sm');

      // Close the drawer before rerendering
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      // Wait for drawer to close
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });

      // Should still highlight on sub-routes
      rerender(
        <MemoryRouter initialEntries={['/region/pnba/adds']}>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton2 = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton2);

      // Wait for drawer and find updated link
      await screen.findByRole('dialog');
      const updatedLink = await screen.findByRole('link', { name: /^current$/i });

      expect(updatedLink).toHaveClass('bg-gradient-primary');
      expect(updatedLink).toHaveClass('shadow-sm');
    });

    it('should highlight active "Elsewhere" link', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/region/pnba/elsewhere']}>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      // Wait for drawer and find link
      await screen.findByRole('dialog');
      const elsewhereLink = await screen.findByRole('link', { name: /^elsewhere$/i });

      expect(elsewhereLink).toHaveClass('bg-gradient-primary');
      expect(elsewhereLink).toHaveClass('shadow-sm');
    });

    it('should highlight active "Unique" link', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/region/pnba/unique']}>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      // Wait for drawer and find link
      await screen.findByRole('dialog');
      const uniqueLink = await screen.findByRole('link', { name: /^unique$/i });

      expect(uniqueLink).toHaveClass('bg-gradient-primary');
      expect(uniqueLink).toHaveClass('shadow-sm');
    });

    it('should update "Current" link when region changes', async () => {
      mockUseRegion.mockReturnValue({
        currentRegion: {
          abbreviation: 'SIBA',
          fullName: 'Southern Independent Booksellers Alliance',
          regionCode: 'se',
        },
        setCurrentRegion: vi.fn(),
      });

      const user = userEvent.setup();

      render(
        <MemoryRouter>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      // Wait for drawer and find link
      await screen.findByRole('dialog');
      const currentLink = await screen.findByRole('link', { name: /^current$/i });

      expect(currentLink).toHaveAttribute('href', '/region/siba');
    });

    it('should not highlight "Current" when on "Unique" page', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/region/pnba/unique']}>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      // Wait for drawer
      await screen.findByRole('dialog');

      const currentLink = await screen.findByRole('link', { name: /^current$/i });
      const uniqueLink = await screen.findByRole('link', { name: /^unique$/i });

      // Current should NOT be highlighted
      expect(currentLink).not.toHaveClass('bg-gradient-primary');
      expect(currentLink).toHaveClass('text-muted-foreground');

      // Unique should be highlighted
      expect(uniqueLink).toHaveClass('bg-gradient-primary');
      expect(uniqueLink).toHaveClass('text-white');
    });

    it('should not highlight "Current" when on "Elsewhere" page', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/region/pnba/elsewhere']}>
          <MobileNav />
        </MemoryRouter>
      );

      const menuButton = screen.getByRole('button', { name: /open menu/i });
      await user.click(menuButton);

      // Wait for drawer
      await screen.findByRole('dialog');

      const currentLink = await screen.findByRole('link', { name: /^current$/i });
      const elsewhereLink = await screen.findByRole('link', { name: /^elsewhere$/i });

      // Current should NOT be highlighted
      expect(currentLink).not.toHaveClass('bg-gradient-primary');
      expect(currentLink).toHaveClass('text-muted-foreground');

      // Elsewhere should be highlighted
      expect(elsewhereLink).toHaveClass('bg-gradient-primary');
      expect(elsewhereLink).toHaveClass('text-white');
    });
  });
});
