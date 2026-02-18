import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeroSection } from './HeroSection';

describe('HeroSection', () => {
  it('should show "Year to Date" badge for incomplete year', () => {
    render(
      <HeroSection
        year={2026}
        isComplete={false}
        stats={{ totalRegions: 9, totalWeeks: 7, totalBooks: 423 }}
      />
    );

    expect(screen.getByText('2026 Year to Date')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('Weeks So Far')).toBeInTheDocument();
  });

  it('should show plain year badge for complete year', () => {
    render(
      <HeroSection
        year={2025}
        isComplete={true}
        stats={{ totalRegions: 9, totalWeeks: 52, totalBooks: 847 }}
      />
    );

    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.getByText('Weeks')).toBeInTheDocument();
  });
});
