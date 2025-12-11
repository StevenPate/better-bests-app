// src/components/BookChart/HeatMapAccordion.tsx
import { useMemo, useRef, useEffect } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { HeatMapCell } from './HeatMapCell';
import { calculateRegionalStats, getShortRegionLabel } from './utils';
import type { HeatMapAccordionProps, RegionalWeekData } from './types';

export function HeatMapAccordion({ data, weekDates, regions, showStats = true }: HeatMapAccordionProps) {
  // Always use small cells (8px) on mobile for consistency
  const cellSize = 'small';
  const columnWidth = '0.5rem';

  return (
    <Accordion type="multiple" className="w-full space-y-2 min-w-0">
      {regions.map((region) => {
        // Convert array to map keyed by weekDate (same as HeatMapGrid)
        const regionData = data.get(region) ?? [];
        const weekDataMap = new Map(
          regionData.map((d) => [d.weekDate, d])
        );
        const hasData = weekDataMap.size > 0;

        return (
          <AccordionRegionItem
            key={region}
            region={region}
            weekData={weekDataMap}
            weekDates={weekDates}
            hasData={hasData}
            cellSize={cellSize}
            columnWidth={columnWidth}
            showStats={showStats}
          />
        );
      })}
    </Accordion>
  );
}

interface AccordionRegionItemProps {
  region: string;
  weekData: Map<string, RegionalWeekData>;
  weekDates: string[];
  hasData: boolean;
  cellSize: 'small' | 'large';
  columnWidth: string;
  showStats: boolean;
}

function AccordionRegionItem({ region, weekData, weekDates, hasData, cellSize, columnWidth, showStats }: AccordionRegionItemProps) {
  const stats = useMemo(() => {
    const data = Array.from(weekData.values());
    return calculateRegionalStats(data);
  }, [weekData]);

  const shortLabel = getShortRegionLabel(region);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to show the most recent week (right side) on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
    }
  }, [weekDates]);

  return (
    <AccordionItem value={region} className="border rounded-lg px-4 overflow-hidden">
      <AccordionTrigger className="hover:no-underline py-3">
        <div className="flex items-center justify-between w-full pr-2">
          <span className="font-semibold text-base">{shortLabel}</span>
          {hasData && showStats ? (
            <span className="text-sm text-muted-foreground">
              {stats.weeksOnList}w | #{stats.bestRank} | avg {stats.averageRank}
            </span>
          ) : hasData ? (
            <span className="text-sm text-muted-foreground">{stats.weeksOnList}w</span>
          ) : (
            <span className="text-sm text-muted-foreground">No appearances</span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {hasData ? (
          <div className="space-y-3 pb-2 overflow-hidden">
            {/* Scrollable heat map - fully contained */}
            <div className="relative w-full overflow-hidden">
              <div
                ref={scrollContainerRef}
                className="grid w-full max-w-full min-w-0 grid-flow-col gap-px overflow-x-auto overflow-y-hidden pb-2 scroll-smooth"
                style={{
                  gridAutoColumns: columnWidth,
                  touchAction: 'pan-x',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                {weekDates.map((weekDate) => (
                  <HeatMapCell
                    key={weekDate}
                    weekData={weekData.get(weekDate) ?? null}
                    weekDate={weekDate}
                    size={cellSize}
                  />
                ))}
              </div>
              {/* Scroll gradient indicators */}
              <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background via-background/60 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background via-background/60 to-transparent" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground pb-2">
            This book has not appeared on {shortLabel} bestseller lists
          </p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
