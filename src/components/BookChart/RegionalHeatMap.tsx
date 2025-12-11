// src/components/BookChart/RegionalHeatMap.tsx
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import { useRegionalHistory } from '@/hooks/useRegionalHistory';
import { useIsMobile } from '@/hooks/use-mobile';
import { HeatMapGrid } from './HeatMapGrid';
import { HeatMapAccordion } from './HeatMapAccordion';
import { HeatMapLegend } from './HeatMapLegend';
import { TimeRangeSelector } from './TimeRangeSelector';
import { generateWeekDates } from './utils';
import type { RegionalHeatMapProps, TimeRange } from './types';

// All tracked regions (always display)
const ALL_REGIONS = ['PNBA', 'CALIBAN', 'CALIBAS', 'GLIBA', 'MPIBA', 'MIBA', 'NAIBA', 'NEIBA', 'SIBA'];

export function RegionalHeatMap({ isbn }: RegionalHeatMapProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>(26);
  const { data, isLoading, error } = useRegionalHistory({ isbn, weeks: timeRange });
  const isMobile = useIsMobile();

  // Generate dates and reverse so time flows left→right (oldest to newest)
  const weekDates = useMemo(() => generateWeekDates(timeRange).reverse(), [timeRange]);

  // Calculate aggregate stats for all regions (used for "All time" view)
  // Must be called before early returns to satisfy Rules of Hooks
  const aggregateStats = useMemo(() => {
    if (!data) return null;

    const allWeeks = new Set<string>();
    const activeRegions = new Set<string>();
    let bestRank: number | null = null;
    const regionStats: Array<{ region: string; weeksOnList: number; bestRank: number; avgRank: number }> = [];

    ALL_REGIONS.forEach(region => {
      const regionData = data.get(region) ?? [];
      if (regionData.length > 0) {
        activeRegions.add(region);

        // Calculate per-region stats
        let totalRank = 0;
        let regionBestRank: number | null = null;
        regionData.forEach((week) => {
          allWeeks.add(week.weekDate);
          totalRank += week.rank;
          if (bestRank === null || week.rank < bestRank) {
            bestRank = week.rank;
          }
          if (regionBestRank === null || week.rank < regionBestRank) {
            regionBestRank = week.rank;
          }
        });

        regionStats.push({
          region,
          weeksOnList: regionData.length,
          bestRank: regionBestRank ?? 0,
          avgRank: Math.round(totalRank / regionData.length)
        });
      }
    });

    return {
      totalWeeks: allWeeks.size,
      activeRegions: activeRegions.size,
      bestRankOverall: bestRank ?? 0,
      regionStats: regionStats.sort((a, b) => b.weeksOnList - a.weeksOnList)
    };
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Regional Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-4 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Regional Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load regional performance data. Please try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasData = data && data.size > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Regional Performance
          </CardTitle>
          <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 overflow-hidden">
        {timeRange !== 'all' && <HeatMapLegend />}

        {hasData ? (
          timeRange === 'all' ? (
            // Show only stats for "All time" view
            aggregateStats && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{aggregateStats.totalWeeks}</div>
                    <div className="text-sm text-muted-foreground">Weeks on Lists</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">#{aggregateStats.bestRankOverall}</div>
                    <div className="text-sm text-muted-foreground">Best Rank</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{aggregateStats.activeRegions}</div>
                    <div className="text-sm text-muted-foreground">Active Regions</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Regional Breakdown</h4>
                  <div className="space-y-2">
                    {aggregateStats.regionStats.map(stat => (
                      <div key={stat.region} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                        <span className="font-medium">{stat.region}</span>
                        <span className="text-sm text-muted-foreground">
                          {stat.weeksOnList}w | #{stat.bestRank} | avg {stat.avgRank}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : (
            // Show grid for 26/52 week views (without stats)
            isMobile ? (
              <HeatMapAccordion
                data={data}
                weekDates={weekDates}
                regions={ALL_REGIONS}
                showStats={false}
              />
            ) : (
              <HeatMapGrid
                data={data}
                weekDates={weekDates}
                regions={ALL_REGIONS}
                timeRange={timeRange}
                showStats={false}
              />
            )
          )
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            This book has not appeared on any regional bestseller lists
          </p>
        )}
      </CardContent>
    </Card>
  );
}
