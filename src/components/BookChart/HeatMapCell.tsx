// src/components/BookChart/HeatMapCell.tsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getRankColor } from './utils';
import type { HeatMapCellProps } from './types';

export function HeatMapCell({ weekData, weekDate, size = 'large' }: HeatMapCellProps) {
  const colorClass = getRankColor(weekData?.rank ?? null);

  // Parse date as UTC to avoid timezone issues with YYYY-MM-DD format
  const [year, month, day] = weekDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const formattedDate = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const ariaLabel = weekData
    ? `Week of ${formattedDate}: Rank ${weekData.rank} in ${weekData.category}`
    : `Week of ${formattedDate}: No data for this region`;

  // Size variants: large = 12px squares (26 weeks), small = 8px wide × 12px tall bars (52 weeks/mobile)
  const sizeClass = size === 'small'
    ? 'w-2 h-3 min-w-2' // 8px × 12px vertical bars
    : 'w-3 h-3 min-w-3';     // 12px × 12px squares

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="gridcell"
            aria-label={ariaLabel}
            tabIndex={0}
            className={`${sizeClass} flex-shrink-0 rounded-sm ${colorClass} transition-opacity hover:opacity-80 focus:ring-2 focus:ring-primary focus:outline-none`}
          />
        </TooltipTrigger>
        {weekData && (
          <TooltipContent>
            <div className="text-sm">
              <div className="font-medium">Week: {formattedDate}, {year}</div>
              <div>Rank: #{weekData.rank} in {weekData.category}</div>
              <div className="text-xs text-muted-foreground">{weekData.listTitle}</div>
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}
