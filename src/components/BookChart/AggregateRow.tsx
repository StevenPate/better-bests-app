// src/components/BookChart/AggregateRow.tsx
import { useMemo } from 'react';
import { HeatMapCell } from './HeatMapCell';
import type { AggregateRowProps, RegionalWeekData } from './types';

export function AggregateRow({ stats, weekDates, allData, cellSize = 'large', showStats = true }: AggregateRowProps) {
  // Aggregate data across all regions for each week
  const aggregatedWeekData = useMemo(() => {
    const map = new Map<string, RegionalWeekData>();

    weekDates.forEach((weekDate) => {
      // Find best rank across all regions for this week
      let bestRank: number | null = null;
      let matchedData: RegionalWeekData | null = null;

      allData.forEach((regionData) => {
        const weekData = regionData.find((d) => d.weekDate === weekDate);
        if (weekData) {
          if (bestRank === null || weekData.rank < bestRank) {
            bestRank = weekData.rank;
            matchedData = weekData;
          }
        }
      });

      if (matchedData) {
        map.set(weekDate, matchedData);
      }
    });

    return map;
  }, [weekDates, allData]);

  return (
    <>
      <div
        role="rowheader"
        className="text-sm font-bold text-foreground flex items-start pt-2 border-t border-border"
      >
        Avg.:
      </div>

      {weekDates.map((weekDate) => (
        <div key={weekDate} className="pt-2 border-t border-border">
          <HeatMapCell
            weekData={aggregatedWeekData.get(weekDate) ?? null}
            weekDate={weekDate}
            size={cellSize}
          />
        </div>
      ))}

      {showStats && (
        <div className="ml-4 text-sm text-muted-foreground pt-2 border-t border-border">
          <span>{stats.totalWeeks}w total</span>
          <span className="mx-2">|</span>
          <span>{stats.activeRegions} regions</span>
        </div>
      )}
    </>
  );
}
