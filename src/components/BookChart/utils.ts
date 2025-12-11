// src/components/BookChart/utils.ts
/**
 * Utility functions for Regional Heat Map
 */

import type { RegionalWeekData, RegionalStats, TimeRange } from './types';

const RANK_COLORS = {
  top5: 'bg-emerald-700',
  top10: 'bg-emerald-500',
  top20: 'bg-emerald-300',
  notOnList: 'bg-muted',
} as const;

export function getRankColor(rank: number | null): string {
  if (rank === null) return RANK_COLORS.notOnList;
  if (rank <= 5) return RANK_COLORS.top5;
  if (rank <= 10) return RANK_COLORS.top10;
  if (rank <= 20) return RANK_COLORS.top20;
  return RANK_COLORS.notOnList;
}

export function calculateRegionalStats(weekData: RegionalWeekData[]): RegionalStats {
  if (weekData.length === 0) {
    return {
      weeksOnList: 0,
      bestRank: 0,
      averageRank: 0,
    };
  }

  const ranks = weekData.map(w => w.rank);
  const bestRank = Math.min(...ranks);
  const averageRank = Math.round(ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length);

  return {
    weeksOnList: weekData.length,
    bestRank,
    averageRank,
  };
}

export function generateWeekDates(range: TimeRange): string[] {
  const weeks = range === 'all' ? 52 : range;
  const dates: string[] = [];

  // Get most recent Wednesday (if today is Wed or later this week, use this week's Wed; otherwise use last week's)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 3 = Wednesday
  const daysToSubtract = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4;
  const mostRecentWednesday = new Date(today);
  mostRecentWednesday.setDate(today.getDate() - daysToSubtract);

  // Reset time to noon to avoid timezone issues
  mostRecentWednesday.setHours(12, 0, 0, 0);

  // Generate week dates going backwards
  for (let i = 0; i < weeks; i++) {
    const weekDate = new Date(mostRecentWednesday);
    weekDate.setDate(mostRecentWednesday.getDate() - (i * 7));

    // Format as YYYY-MM-DD in local time
    const year = weekDate.getFullYear();
    const month = String(weekDate.getMonth() + 1).padStart(2, '0');
    const day = String(weekDate.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }

  return dates;
}

/**
 * Get short display label for region abbreviation
 * Used for compact display in mobile/narrow views
 */
export function getShortRegionLabel(region: string): string {
  const shortLabels: Record<string, string> = {
    PNBA: 'PNBA',
    CALIBAN: 'NorCal',
    CALIBAS: 'SoCal',
    GLIBA: 'GLIBA',
    MPIBA: 'MPIBA',
    NAIBA: 'NAIBA',
    NEIBA: 'NEIBA',
    SIBA: 'SIBA',
  };

  return shortLabels[region] || region;
}
