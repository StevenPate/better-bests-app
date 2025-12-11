// src/components/BookChart/HeatMapCell.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HeatMapCell } from './HeatMapCell';
import type { RegionalWeekData } from './types';

describe('HeatMapCell', () => {
  it('should render cell with correct color for rank 1-5', () => {
    const weekData: RegionalWeekData = {
      region: 'PNBA',
      weekDate: '2025-01-15',
      rank: 3,
      category: 'Fiction',
      listTitle: 'Fiction',
    };

    const { container } = render(
      <HeatMapCell weekData={weekData} weekDate="2025-01-15" />
    );

    const cell = container.firstChild as HTMLElement;
    expect(cell).toHaveClass('bg-emerald-700');
  });

  it('should render muted cell when no data', () => {
    const { container } = render(
      <HeatMapCell weekData={null} weekDate="2025-01-15" />
    );

    const cell = container.firstChild as HTMLElement;
    expect(cell).toHaveClass('bg-muted');
  });

  it('should have accessible gridcell role', () => {
    const weekData: RegionalWeekData = {
      region: 'PNBA',
      weekDate: '2025-01-15',
      rank: 3,
      category: 'Fiction',
      listTitle: 'Fiction',
    };

    render(<HeatMapCell weekData={weekData} weekDate="2025-01-15" />);

    const cell = screen.getByRole('gridcell');
    expect(cell).toBeInTheDocument();
  });

  it('should include week date and rank in aria-label', () => {
    const weekData: RegionalWeekData = {
      region: 'PNBA',
      weekDate: '2025-01-15',
      rank: 3,
      category: 'Fiction',
      listTitle: 'Fiction',
    };

    render(<HeatMapCell weekData={weekData} weekDate="2025-01-15" />);

    const cell = screen.getByRole('gridcell');
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('Jan 15'));
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('Rank 3'));
  });

  it('should show "No data" for empty cells', () => {
    render(<HeatMapCell weekData={null} weekDate="2025-01-15" />);

    const cell = screen.getByRole('gridcell');
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('No data'));
  });
});
