// src/components/BookChart/RegionRow.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RegionRow } from './RegionRow';
import type { RegionalWeekData } from './types';

describe('RegionRow', () => {
  it('should render region label', () => {
    const weekData = new Map<string, RegionalWeekData>();

    render(
      <RegionRow
        region="PNBA"
        weekData={weekData}
        weekDates={['2025-01-15', '2025-01-08']}
      />
    );

    expect(screen.getByText('PNBA:')).toBeInTheDocument();
  });

  it('should render correct number of cells', () => {
    const weekData = new Map<string, RegionalWeekData>();

    render(
      <RegionRow
        region="PNBA"
        weekData={weekData}
        weekDates={['2025-01-15', '2025-01-08', '2025-01-01']}
      />
    );

    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(3);
  });

  it('should have accessible rowheader role', () => {
    const weekData = new Map<string, RegionalWeekData>();

    render(
      <RegionRow
        region="PNBA"
        weekData={weekData}
        weekDates={['2025-01-15']}
      />
    );

    const rowHeader = screen.getByRole('rowheader');
    expect(rowHeader).toBeInTheDocument();
    expect(rowHeader).toHaveTextContent('PNBA:');
  });

  it('should display stats when data exists', () => {
    const weekData = new Map<string, RegionalWeekData>([
      ['2025-01-15', {
        region: 'PNBA',
        weekDate: '2025-01-15',
        rank: 3,
        category: 'Fiction',
        listTitle: 'Fiction',
      }],
    ]);

    render(
      <RegionRow
        region="PNBA"
        weekData={weekData}
        weekDates={['2025-01-15']}
      />
    );

    expect(screen.getByText('1w')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });
});
