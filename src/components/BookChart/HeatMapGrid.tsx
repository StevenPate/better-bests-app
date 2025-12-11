// src/components/BookChart/HeatMapGrid.tsx
import { useMemo } from 'react';
import { RegionRow } from './RegionRow';
import { AggregateRow } from './AggregateRow';
import type { HeatMapGridProps, AggregateStats } from './types';

export function HeatMapGrid({ data, weekDates, regions, timeRange, showStats = true }: HeatMapGridProps) {
  // Determine cell size and grid spacing based on time range
  const cellSize = timeRange === 26 ? 'large' : 'small';
  const columnWidth = timeRange === 26 ? '0.75rem' : '0.5rem'; // 12px for 26 weeks, 8px for 52+
  const gap = timeRange === 26 ? '0.125rem' : '0.0625rem'; // 2px for 26 weeks, 1px for 52+
  // Calculate aggregate stats
  const aggregateStats: AggregateStats = useMemo(() => {
    const allWeeks = new Set<string>();
    const activeRegions = new Set<string>();
    let bestRank: number | null = null;

    data.forEach((regionData, region) => {
      if (regionData.length > 0) {
        activeRegions.add(region);
      }

      regionData.forEach((week) => {
        allWeeks.add(week.weekDate);
        if (bestRank === null || week.rank < bestRank) {
          bestRank = week.rank;
        }
      });
    });

    return {
      totalWeeks: allWeeks.size,
      activeRegions: activeRegions.size,
      bestRankOverall: bestRank ?? 0,
    };
  }, [data]);

  // Prepare aggregate week data
  const aggregatedWeekData = useMemo(() => {
    const map = new Map();
    weekDates.forEach((weekDate) => {
      let bestRank: number | null = null;
      let matchedData = null;

      data.forEach((regionData) => {
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
  }, [weekDates, data]);

  return (
    <div
      role="grid"
      aria-label="Regional bestseller performance heat map"
      className="grid gap-y-2 overflow-x-auto"
      style={{
        gridTemplateColumns: showStats
          ? `5rem repeat(${weekDates.length}, ${columnWidth}) 1fr`
          : `5rem repeat(${weekDates.length}, ${columnWidth})`,
        columnGap: gap,
      }}
    >
      {regions.map((region) => {
        // Convert array to map keyed by weekDate
        const regionData = data.get(region) ?? [];
        const weekDataMap = new Map(
          regionData.map((d) => [d.weekDate, d])
        );

        return (
          <RegionRow
            key={region}
            region={region}
            weekData={weekDataMap}
            weekDates={weekDates}
            cellSize={cellSize}
            showStats={showStats}
          />
        );
      })}

      <AggregateRow
        stats={aggregateStats}
        weekDates={weekDates}
        allData={data}
        cellSize={cellSize}
        showStats={showStats}
      />
    </div>
  );
}
