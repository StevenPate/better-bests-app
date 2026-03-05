import React from 'react';
import { Link } from 'react-router-dom';
import { TableCell, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { BookRowProps } from './types';
import { getRowClassName, getRankChangeIcon, getRankChangeIconClasses, getRankChangeText, getRankChangeType } from './utils';

/**
 * A single table row displaying a book with all its information and controls
 */
export const BookRow: React.FC<BookRowProps> = ({
  book,
  bookKey,
  isAudienceFiltered,
  isMobile,
  isPbnStaff,
  effectivePosChecked,
  effectiveShelfChecked,
  isEligible,
  switchesLocked,
  bulkPending,
  onPosChange,
  onShelfChange,
  onCopyISBN,
  getRemoteKey,
  pendingFor,
  mutationFor
}) => {
  const remoteKey = getRemoteKey(book, bookKey);
  const posPending = isPbnStaff ? pendingFor('pos', remoteKey) : false;
  const shelfPending = isPbnStaff ? pendingFor('shelf', remoteKey) : false;
  const posStatus = isPbnStaff ? mutationFor('pos', remoteKey) : undefined;
  const shelfStatus = isPbnStaff ? mutationFor('shelf', remoteKey) : undefined;

  const disablePosCheckbox = !isEligible || switchesLocked || bulkPending.pos || posPending;
  const disableShelfCheckbox = switchesLocked || bulkPending.shelf || shelfPending;

  // Rank change helpers
  const Icon = getRankChangeIcon(book);
  const changeText = getRankChangeText(book);
  const changeType = getRankChangeType(book);

  const renderRankChangeBadge = () => {
    if (changeType === 'new' || changeType === 'up') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-700 dark:bg-green-950 border border-green-800 dark:border-green-900 rounded text-xs font-medium text-white dark:text-green-400">
          <Icon className="w-3.5 h-3.5" />
          {changeText}
        </div>
      );
    }
    if (changeType === 'dropped' || changeType === 'down') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-700 dark:bg-red-950 border border-red-800 dark:border-red-900 rounded text-xs font-medium text-white dark:text-red-400">
          <Icon className="w-3.5 h-3.5" />
          {changeText}
        </div>
      );
    }
    return <div className="text-sm text-muted-foreground">{changeText}</div>;
  };

  const renderSwitchControl = (
    type: 'pos' | 'shelf',
    checked: boolean,
    disabled: boolean,
    pending: boolean,
    status: string | undefined,
    onChange: (checked: boolean) => void
  ) => {
    const ariaLabel = disabled
      ? `${type.toUpperCase()} switch loading, please wait`
      : `Toggle ${type.toUpperCase()} for ${book.title}`;
    const cellClasses = isMobile ? 'p-2' : '';

    return (
      <div className={`flex justify-center ${cellClasses}`}>
        <div className="flex items-center gap-2" aria-live="polite">
          <Checkbox
            checked={checked}
            onCheckedChange={(checked) => onChange(checked as boolean)}
            className="h-4 w-4 rounded-sm border-2 border-primary data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            disabled={disabled}
            aria-label={ariaLabel}
          />
          {pending && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          {!pending && status === 'success' && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
          )}
          {!pending && status === 'error' && (
            <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-hidden="true" />
          )}
        </div>
      </div>
    );
  };

  return (
    <TableRow className={getRowClassName(book)}>
      {/* Rank or List Name Column */}
      {!isAudienceFiltered ? (
        <TableCell className="font-medium">
          {book.wasDropped ? '' : `#${book.rank}`}
        </TableCell>
      ) : (
        <TableCell className={`font-medium ${isMobile ? 'text-xs p-2' : 'text-sm'}`}>
          {book.listName}
        </TableCell>
      )}

      {/* Book Info Column */}
      <TableCell className="font-medium">
        <div className="flex flex-col">
          {book.isbn ? (
            <Link
              to={`/book/${book.isbn}`}
              className="text-base font-semibold text-primary hover:underline cursor-pointer transition-colors"
            >
              {book.title}
            </Link>
          ) : (
            <span className="text-base font-semibold">{book.title}</span>
          )}
          <span className="text-sm text-muted-foreground">{book.author}</span>
          <div className="flex items-center gap-1 mt-1">
            <span className="font-mono text-xs text-muted-foreground/70">{book.isbn}</span>
            {book.isbn && (
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 text-muted-foreground/60 hover:text-muted-foreground"
                onClick={() => onCopyISBN(book.isbn)}
                aria-label={`Copy ISBN ${book.isbn} to clipboard`}
              >
                <Copy className="w-2.5 h-2.5" />
              </Button>
            )}
          </div>
        </div>
      </TableCell>

      {/* Rank Change Column (only for non-audience-filtered views) */}
      {!isMobile && !isAudienceFiltered && (
        <TableCell>
          {renderRankChangeBadge()}
        </TableCell>
      )}

      {/* Weeks on List Column (desktop only) */}
      {!isMobile && (
        <TableCell className="text-center">
          <span className="text-sm font-medium">{book.weeksOnList || 1}</span>
        </TableCell>
      )}

      {/* POS Switch Column (staff only) */}
      {isPbnStaff && (
        <TableCell>
          {isEligible ? (
            renderSwitchControl(
              'pos',
              effectivePosChecked[bookKey] || false,
              disablePosCheckbox,
              posPending,
              posStatus,
              (checked) => onPosChange(bookKey, book, checked)
            )
          ) : (
            <div className="flex justify-center">
              <span className="text-muted-foreground">—</span>
            </div>
          )}
        </TableCell>
      )}

      {/* Shelf Switch Column (staff only) */}
      {isPbnStaff && (
        <TableCell>
          {isEligible ? (
            renderSwitchControl(
              'shelf',
              effectiveShelfChecked[bookKey] || false,
              disableShelfCheckbox,
              shelfPending,
              shelfStatus,
              (checked) => onShelfChange(bookKey, book, checked)
            )
          ) : (
            <div className="flex justify-center">
              <span className="text-muted-foreground">—</span>
            </div>
          )}
        </TableCell>
      )}
    </TableRow>
  );
};
