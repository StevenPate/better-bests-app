// src/components/BookChart/RegionRow.tsx
import { useMemo } from 'react';
import { HeatMapCell } from './HeatMapCell';
import { RegionalStats } from './RegionalStats';
import { calculateRegionalStats, getShortRegionLabel } from './utils';
import type { RegionRowProps } from './types';

export function RegionRow({ region, weekData, weekDates, cellSize = 'large', showStats = true }: RegionRowProps) {
  const stats = useMemo(() => {
    const data = Array.from(weekData.values());
    return calculateRegionalStats(data);
  }, [weekData]);

  const shortLabel = getShortRegionLabel(region);

  return (
    <>
      <div
        role="rowheader"
        className="text-sm font-medium text-foreground flex items-center"
      >
        {shortLabel}:
      </div>

      {weekDates.map((weekDate) => (
        <HeatMapCell
          key={weekDate}
          weekData={weekData.get(weekDate) ?? null}
          weekDate={weekDate}
          size={cellSize}
        />
      ))}

      {showStats && (
        <div className="ml-4">
          <RegionalStats stats={stats} />
        </div>
      )}
    </>
  );
}
