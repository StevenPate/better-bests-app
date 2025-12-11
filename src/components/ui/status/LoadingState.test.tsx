import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { LoadingState } from './LoadingState';
import { Loader } from 'lucide-react';

describe('LoadingState', () => {
  it('renders with default loading message', () => {
    render(<LoadingState />);
    // Message appears twice: once visible, once in sr-only span
    const messages = screen.getAllByText('Loading...');
    expect(messages.length).toBeGreaterThan(0);
  });

  it('renders with custom message', () => {
    render(<LoadingState message="Fetching data..." />);
    // Message appears twice: once visible, once in sr-only span
    const messages = screen.getAllByText('Fetching data...');
    expect(messages.length).toBeGreaterThan(0);
  });

  it('renders default spinning RefreshCw icon', () => {
    const { container } = render(<LoadingState />);

    // Check that the icon container exists with animation
    const iconContainer = container.querySelector('[aria-hidden="true"]');
    expect(iconContainer).toBeInTheDocument();

    // Check for spinning animation class
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders custom icon when provided', () => {
    render(
      <LoadingState
        icon={<Loader data-testid="custom-loader" />}
      />
    );
    expect(screen.getByTestId('custom-loader')).toBeInTheDocument();
  });

  it('renders with Card wrapper by default', () => {
    const { container } = render(<LoadingState message="Loading data" />);

    // Card component has border classes
    expect(container.querySelector('.border')).toBeInTheDocument();
  });

  it('renders inline size variant without card wrapper', () => {
    const { container } = render(
      <LoadingState
        message="Inline loading"
        size="inline"
      />
    );

    expect(container.querySelector('[role="status"]')).toBeInTheDocument();
    expect(container.querySelector('.border')).not.toBeInTheDocument();
  });

  it('renders compact size with reduced padding', () => {
    const { container } = render(
      <LoadingState
        message="Compact loading"
        size="compact"
      />
    );

    const statusElement = container.querySelector('[role="status"]');
    expect(statusElement?.className).toContain('py-8');
  });

  it('has proper accessibility attributes', () => {
    const { container } = render(
      <LoadingState message="Loading content" />
    );

    const statusElement = container.querySelector('[role="status"]');
    expect(statusElement).toBeInTheDocument();
    expect(statusElement).toHaveAttribute('aria-live', 'polite');
    expect(statusElement).toHaveAttribute('aria-busy', 'true');
  });

  it('includes screen reader only text', () => {
    render(<LoadingState message="Loading items" />);

    // Check for sr-only span with message
    const srOnlyElements = document.querySelectorAll('.sr-only');
    const hasLoadingText = Array.from(srOnlyElements).some(
      el => el.textContent === 'Loading items'
    );
    expect(hasLoadingText).toBe(true);
  });

  it('applies custom className', () => {
    const { container } = render(
      <LoadingState
        message="Loading"
        className="custom-loading-class"
      />
    );

    const statusElement = container.querySelector('[role="status"]');
    expect(statusElement?.className).toContain('custom-loading-class');
  });

  it('shows different content for different sizes', () => {
    const { container: defaultContainer } = render(
      <LoadingState message="Default" />
    );
    const { container: inlineContainer } = render(
      <LoadingState message="Inline" size="inline" />
    );

    const defaultStatus = defaultContainer.querySelector('[role="status"]');
    const inlineStatus = inlineContainer.querySelector('[role="status"]');

    expect(defaultStatus?.className).toContain('py-12');
    expect(inlineStatus?.className).toContain('py-4');
  });

  describe('Accessibility', () => {
    it('should have no accessibility violations (basic)', async () => {
      const { container } = render(
        <LoadingState />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (custom message)', async () => {
      const { container } = render(
        <LoadingState message="Loading content, please wait..." />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (with custom icon)', async () => {
      const { container } = render(
        <LoadingState
          message="Processing"
          icon={<Loader data-testid="custom-loader" />}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (inline size)', async () => {
      const { container } = render(
        <LoadingState
          message="Loading"
          size="inline"
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have no accessibility violations (compact size)', async () => {
      const { container } = render(
        <LoadingState
          message="Loading"
          size="compact"
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
