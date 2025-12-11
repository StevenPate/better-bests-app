import React from 'react';
import { TableHead, TableHeader as TableHeaderUI, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowUpDown, Loader2 } from 'lucide-react';
import { TableHeaderProps } from './types';

/**
 * Table header row with sortable columns and bulk selection checkboxes
 */
export const TableHeader: React.FC<TableHeaderProps> = ({
  isAudienceFiltered,
  isMobile,
  isPbnStaff,
  sortBy,
  onSortChange,
  allPosChecked,
  allShelfChecked,
  onBulkPosChange,
  onBulkShelfChange,
  bulkPosDisabled,
  bulkShelfDisabled,
  posBulkLabel,
  shelfBulkLabel,
  switchesLoading,
  bulkPending
}) => {
  return (
    <TableHeaderUI>
      <TableRow>
        {!isAudienceFiltered && <TableHead className="w-12">Rank</TableHead>}
        {isAudienceFiltered && !isMobile && <TableHead className="w-20">List</TableHead>}
        {isAudienceFiltered && isMobile && <TableHead className="w-20 text-xs">List</TableHead>}

        <TableHead>
          <div className="flex items-center gap-2">
            Title
            <Button
              variant="ghost"
              size="sm"
              onClick={onSortChange}
              className={`h-6 w-6 p-0 ${sortBy === 'title' ? 'bg-muted/50' : ''}`}
              aria-label={sortBy === 'title' ? 'Sort by rank' : 'Sort by title'}
              aria-pressed={sortBy === 'title'}
            >
              <ArrowUpDown className="w-3 h-3" />
            </Button>
          </div>
        </TableHead>

        {!isMobile && !isAudienceFiltered && <TableHead className="w-20">Change</TableHead>}
        {!isMobile && <TableHead className="w-16">Weeks</TableHead>}

        {isPbnStaff && (
          <>
            <TableHead className={isMobile ? 'w-16 p-2' : 'w-16'}>
              <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-2'}`}>
                <span className={isMobile ? 'text-xs' : ''}>POS</span>
                <Checkbox
                  checked={allPosChecked}
                  onCheckedChange={(checked) => onBulkPosChange(checked as boolean)}
                  className="h-3 w-3"
                  disabled={bulkPosDisabled}
                  aria-label={posBulkLabel}
                  title={bulkPosDisabled ? 'POS switches unavailable while loading' : undefined}
                />
                {(switchesLoading || bulkPending.pos) && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
                )}
              </div>
            </TableHead>

            <TableHead className={isMobile ? 'w-16 p-2' : 'w-16'}>
              <div className={`flex items-center ${isMobile ? 'gap-1' : 'gap-2'}`}>
                <span className={isMobile ? 'text-xs' : ''}>Shelf</span>
                <Checkbox
                  checked={allShelfChecked}
                  onCheckedChange={(checked) => onBulkShelfChange(checked as boolean)}
                  className="h-3 w-3"
                  disabled={bulkShelfDisabled}
                  aria-label={shelfBulkLabel}
                  title={bulkShelfDisabled ? 'Shelf switches unavailable while loading' : undefined}
                />
                {(switchesLoading || bulkPending.shelf) && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden="true" />
                )}
              </div>
            </TableHead>
          </>
        )}
      </TableRow>
    </TableHeaderUI>
  );
};
