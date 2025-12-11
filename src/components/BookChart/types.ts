// src/components/BookChart/types.ts
/**
 * Type definitions for Regional Heat Map visualization
 */

export interface RegionalWeekData {
  region: string;
  weekDate: string;
  rank: number;
  category: string;
  listTitle: string;
}

export interface RegionalStats {
  weeksOnList: number;
  bestRank: number;
  averageRank: number;
}

export interface AggregateStats {
  totalWeeks: number;
  activeRegions: number;
  bestRankOverall: number;
}

export type TimeRange = 26 | 52 | 'all';

export interface RegionalHeatMapProps {
  isbn: string;
}

export interface HeatMapCellProps {
  weekData: RegionalWeekData | null;
  weekDate: string;
  size?: 'small' | 'large'; // small = 6px wide bars, large = 16px squares
}

export interface RegionRowProps {
  region: string;
  weekData: Map<string, RegionalWeekData>;
  weekDates: string[];
  cellSize?: 'small' | 'large';
  showStats?: boolean;
}

export interface HeatMapGridProps {
  data: Map<string, RegionalWeekData[]>;
  weekDates: string[];
  regions: string[];
  timeRange: TimeRange;
  showStats?: boolean;
}

export interface HeatMapAccordionProps {
  data: Map<string, RegionalWeekData[]>;
  weekDates: string[];
  regions: string[];
  showStats?: boolean;
}

export interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
}

export interface RegionalStatsProps {
  stats: RegionalStats;
}

export interface AggregateRowProps {
  stats: AggregateStats;
  weekDates: string[];
  allData: Map<string, RegionalWeekData[]>;
  cellSize?: 'small' | 'large';
  showStats?: boolean;
}
