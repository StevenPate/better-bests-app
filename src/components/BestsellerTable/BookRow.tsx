import React from 'react';
import { TableCell, TableRow } from '@/components/ui/table';
import { BookRowProps } from './types';
import { getRowClassName } from './utils';
import { BookInfoCell } from './BookInfoCell';
import { RankChangeCell } from './RankChangeCell';
import { SwitchControls } from './SwitchControls';

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
        <BookInfoCell book={book} onCopyISBN={onCopyISBN} />
      </TableCell>

      {/* Rank Change Column (only for non-audience-filtered views) */}
      {!isMobile && !isAudienceFiltered && (
        <TableCell>
          <RankChangeCell book={book} />
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
            <SwitchControls
              type="pos"
              checked={effectivePosChecked[bookKey] || false}
              disabled={disablePosCheckbox}
              pending={posPending}
              status={posStatus}
              bookTitle={book.title}
              isMobile={isMobile}
              onChange={(checked) => onPosChange(bookKey, book, checked)}
            />
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
            <SwitchControls
              type="shelf"
              checked={effectiveShelfChecked[bookKey] || false}
              disabled={disableShelfCheckbox}
              pending={shelfPending}
              status={shelfStatus}
              bookTitle={book.title}
              isMobile={isMobile}
              onChange={(checked) => onShelfChange(bookKey, book, checked)}
            />
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
