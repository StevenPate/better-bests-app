import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { VendorLinks } from './VendorLinks';

describe('VendorLinks', () => {
  it('renders one link per vendor', () => {
    render(<VendorLinks isbn="9780593321447" />);
    expect(screen.getByRole('link', { name: 'Open 9780593321447 in iPage' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open 9780593321447 in PubEasy' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open 9780593321447 in Edelweiss' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open 9780593321447 in PRH' })).toBeInTheDocument();
  });

  it('labels each link with the vendor name', () => {
    render(<VendorLinks isbn="9780593321447" />);
    expect(screen.getByText('iPage')).toBeInTheDocument();
    expect(screen.getByText('PubEasy')).toBeInTheDocument();
    expect(screen.getByText('Edelweiss')).toBeInTheDocument();
    expect(screen.getByText('PRH')).toBeInTheDocument();
  });

  it('opens every link in a new tab without leaking the referrer', () => {
    render(<VendorLinks isbn="9780593321447" />);
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('uses the normalized ISBN in the href and the aria-label', () => {
    render(<VendorLinks isbn="978-0-593-32144-7" />);
    const edelweiss = screen.getByRole('link', { name: 'Open 9780593321447 in Edelweiss' });
    expect(edelweiss).toHaveAttribute(
      'href',
      'https://www.edelweiss.plus/#keywordSearch&q=9780593321447'
    );
  });

  it('renders nothing when the title has no valid ISBN-13', () => {
    const { container } = render(<VendorLinks isbn="0593321447" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the ISBN is missing', () => {
    const { container } = render(<VendorLinks isbn={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides the separators from assistive technology', () => {
    render(<VendorLinks isbn="9780593321447" />);
    const separators = screen.getAllByText('·');
    expect(separators).toHaveLength(3);
    for (const separator of separators) {
      expect(separator).toHaveAttribute('aria-hidden', 'true');
    }
  });
  // src/index.css colors every `main a` / `section a` with the primary color
  // unless its class list contains "inline-flex" or "button". These links are
  // meant to read as muted secondary text, so they take that opt-out.
  it('opts out of the global content-link color rule', () => {
    render(<VendorLinks isbn="9780593321447" />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toMatch(/inline-flex/);
    }
  });
});
