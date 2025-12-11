// src/components/BookChart/RegionalStats.tsx
import type { RegionalStatsProps } from './types';

export function RegionalStats({ stats }: RegionalStatsProps) {
  if (stats.weeksOnList === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No appearances
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span>{stats.weeksOnList}w</span>
      <span className="text-xs">|</span>
      <span>#{stats.bestRank}</span>
      <span className="text-xs">|</span>
      <span>avg {stats.averageRank}</span>
    </div>
  );
}
