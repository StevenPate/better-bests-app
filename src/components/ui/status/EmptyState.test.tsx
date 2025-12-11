import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { EmptyState } from './EmptyState';
import { Search } from 'lucide-react';

describe('EmptyState', () => {
  it('renders with title', () => {
    render(<EmptyState title="No results found" />);
    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('renders with title and description', () => {
    render(
      <EmptyState
        title="No results found"
        description="Try adjusting your filters"
      />
    );
    expect(screen.getByText('No results found')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your filters')).toBeInTheDocument();
  });

  it('renders with custom icon', () => {
    render(
      <EmptyState
        title="No results"
        icon={<Search data-testid="search-icon" />}
      />
    );
    expect(screen.getByTestId('search-icon')).toBeInTheDocument();
  });

  it('renders action buttons and calls onClick', () => {
    const mockAction = vi.fn();
    render(
      <EmptyState
        title="No results"
        actions={[
          { label: 'Reset Filters', onClick: mockAction, variant: 'outline' }
        ]}
      />
    );

    const button = screen.getByRole('button', { name: /reset filters/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(mockAction).toHaveBeenCalledTimes(1);
  });

  it('renders multiple action buttons', () => {
    const mockAction1 = vi.fn();
    const mockAction2 = vi.fn();

    render(
      <EmptyState
        title="No results"
        actions={[
          { label: 'Action 1', onClick: mockAction1 },
          { label: 'Action 2', onClick: mockAction2 }
        ]}
      />
    );

    expect(screen.getByRole('button', { name: /action 1/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /action 2/i })).toBeInTheDocument();
  });

  it('applies warning variant styling', () => {
    const { container } = render(
      <EmptyState
        title="Warning message"
        variant="warning"
      />
    );

    // Check for warning-specific classes
    const title = screen.getByText('Warning message');
    expect(title.className).toContain('text-amber');
  });

  it('renders inline size variant without card wrapper', () => {
    const { container } = render(
      <EmptyState
        title="Inline message"
        size="inline"
      />
    );

    // Should not have Card wrapper when inline
    expect(container.querySelector('[role="status"]')).toBeInTheDocument();
    expect(container.querySelector('.border')).not.toBeInTheDocument();
  });

  it('renders compact size with reduced padding', () => {
    const { container } = render(
      <EmptyState
        title="Compact message"
        size="compact"
      />
    );

    const statusElement = container.querySelector('[role="status"]');
    expect(statusElement?.className).toContain('py-8');
  });

  it('has proper accessibility attributes', () => {
    const { container } = render(
      <EmptyState title="No results" />
    );

    const statusElement = container.querySelector('[role="status"]');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveAttribute('aria-live', 'polite');
  });

  it('applies custom className', () => {
    const { container } = render(
      <EmptyState
        title="Test"
        className="custom-class"
      />
    );

    const statusElement = container.querySelector('[role="status"]');
    expect(statusElement?.className).toContain('custom-class');
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations (basic)', async () => {
      const { container } = render(
        <EmptyState title="No results found" />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (with description and icon)', async () => {
      const { container } = render(
        <EmptyState
          title="No results found"
          description="Try adjusting your search filters"
          icon={<Search aria-label="search" />}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (with actions)', async () => {
      const { container } = render(
        <EmptyState
          title="No results"
          actions={[
            { label: 'Reset Filters', onClick: vi.fn() },
            { label: 'Clear Search', onClick: vi.fn() }
          ]}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (warning variant)', async () => {
      const { container } = render(
        <EmptyState
          title="No items available"
          variant="warning"
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (inline size)', async () => {
      const { container } = render(
        <EmptyState
          title="No results"
          size="inline"
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
