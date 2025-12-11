import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ErrorState } from './ErrorState';
import { AlertCircle } from 'lucide-react';

describe('ErrorState', () => {
  it('renders with title', () => {
    render(<ErrorState title="An error occurred" />);
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
  });

  it('renders with title and description', () => {
    render(
      <ErrorState
        title="An error occurred"
        description="Please try again later"
      />
    );
    expect(screen.getByText('An error occurred')).toBeInTheDocument();
    expect(screen.getByText('Please try again later')).toBeInTheDocument();
  });

  it('renders default AlertCircle icon', () => {
    const { container } = render(<ErrorState title="Error" />);
    // Check that the icon container exists
    const iconContainer = container.querySelector('[aria-hidden="true"]');
    expect(iconContainer).toBeInTheDocument();
  });

  it('renders custom icon when provided', () => {
    render(
      <ErrorState
        title="Error"
        icon={<div data-testid="custom-icon">Custom</div>}
      />
    );
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
  });

  it('renders retry button when onRetry provided', () => {
    const mockRetry = vi.fn();
    render(
      <ErrorState
        title="Error"
        onRetry={mockRetry}
      />
    );

    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    fireEvent.click(retryButton);
    expect(mockRetry).toHaveBeenCalledTimes(1);
  });

  it('renders reset filters button when onResetFilters provided', () => {
    const mockReset = vi.fn();
    render(
      <ErrorState
        title="Error"
        onResetFilters={mockReset}
      />
    );

    const resetButton = screen.getByRole('button', { name: /reset filters/i });
    expect(resetButton).toBeInTheDocument();

    fireEvent.click(resetButton);
    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('renders both retry and reset filters buttons', () => {
    const mockRetry = vi.fn();
    const mockReset = vi.fn();

    render(
      <ErrorState
        title="Error"
        onRetry={mockRetry}
        onResetFilters={mockReset}
      />
    );

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset filters/i })).toBeInTheDocument();
  });

  it('renders custom actions in addition to retry/reset', () => {
    const mockAction = vi.fn();
    render(
      <ErrorState
        title="Error"
        onRetry={vi.fn()}
        actions={[
          { label: 'Custom Action', onClick: mockAction }
        ]}
      />
    );

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /custom action/i })).toBeInTheDocument();
  });

  it('applies warning variant styling', () => {
    const { container } = render(
      <ErrorState
        title="Warning"
        variant="warning"
      />
    );

    const title = screen.getByText('Warning');
    expect(title.className).toContain('text-amber');
  });

  it('applies error variant styling by default', () => {
    const { container } = render(
      <ErrorState title="Error" />
    );

    const title = screen.getByText('Error');
    expect(title.className).toContain('text-destructive');
  });

  it('renders inline size variant without card wrapper', () => {
    const { container } = render(
      <ErrorState
        title="Inline error"
        size="inline"
      />
    );

    expect(container.querySelector('[role="alert"]')).toBeInTheDocument();
    expect(container.querySelector('.border')).not.toBeInTheDocument();
  });

  it('has proper accessibility attributes', () => {
    const { container } = render(
      <ErrorState title="Error occurred" />
    );

    const alertElement = container.querySelector('[role="alert"]');
    expect(alertElement).toBeInTheDocument();
    expect(alertElement).toHaveAttribute('aria-live', 'assertive');
  });

  it('auto-focuses heading when autoFocus is true', () => {
    render(
      <ErrorState
        title="Important error"
        autoFocus={true}
      />
    );

    const heading = screen.getByText('Important error');
    expect(heading).toHaveAttribute('tabIndex', '-1');
  });

  it('does not set tabIndex when autoFocus is false', () => {
    render(
      <ErrorState
        title="Error"
        autoFocus={false}
      />
    );

    const heading = screen.getByText('Error');
    expect(heading).not.toHaveAttribute('tabIndex');
  });

  it('applies custom className', () => {
    const { container } = render(
      <ErrorState
        title="Error"
        className="custom-error-class"
      />
    );

    const alertElement = container.querySelector('[role="alert"]');
    expect(alertElement?.className).toContain('custom-error-class');
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations (basic error)', async () => {
      const { container } = render(
        <ErrorState title="An error occurred" />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (with description)', async () => {
      const { container } = render(
        <ErrorState
          title="Failed to load data"
          description="The server is temporarily unavailable. Please try again later."
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (with retry action)', async () => {
      const { container } = render(
        <ErrorState
          title="Connection error"
          onRetry={vi.fn()}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (with multiple actions)', async () => {
      const { container } = render(
        <ErrorState
          title="Error occurred"
          onRetry={vi.fn()}
          onResetFilters={vi.fn()}
          actions={[
            { label: 'Contact Support', onClick: vi.fn() }
          ]}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (warning variant)', async () => {
      const { container } = render(
        <ErrorState
          title="Partial failure"
          variant="warning"
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (with auto-focus)', async () => {
      const { container } = render(
        <ErrorState
          title="Critical error"
          autoFocus={true}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (inline size)', async () => {
      const { container } = render(
        <ErrorState
          title="Error"
          size="inline"
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
