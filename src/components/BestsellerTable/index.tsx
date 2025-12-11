import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRegion } from '@/hooks/useRegion';
import { useBestsellerSwitches } from '@/hooks/useBestsellerSwitches';
import { BestsellerCategory } from '@/types/bestseller';
import {
  BestsellerTableBook,
  SwitchType,
  MutationStatus,
  SwitchState,
  SortOrder
} from './types';
import {
  getBookKey,
  isEligibleForSwitching,
  sortBooks
} from './utils';
import { CategoryHeader } from './CategoryHeader';
import { TableHeader } from './TableHeader';
import { BookRow } from './BookRow';

interface BestsellerTableProps {
  category: BestsellerCategory;
  onSwitchingDataClear?: () => void;
  isAudienceFiltered?: boolean;
  listDate?: string;
}

/**
 * Main table component for displaying bestseller books with sorting, filtering,
 * and POS/Shelf switching functionality
 */
export const BestsellerTable: React.FC<BestsellerTableProps> = ({
  category,
  onSwitchingDataClear,
  isAudienceFiltered = false,
  listDate
}) => {
  const { toast } = useToast();
  const { isPbnStaff } = useAuth();
  const isMobile = useIsMobile();
  const { currentRegion } = useRegion();

  // Get current list date from props or fallback to current date
  const currentListDate = listDate || new Date().toISOString().split('T')[0];

  // Use the database-backed hook for switches (region-aware)
  const {
    posChecked,
    shelfChecked,
    loading: switchesLoading,
    loadError,
    pendingSwitches,
    bulkPending,
    mutationStatus,
    retryLoad,
    handlePosChange: handlePosChangeDB,
    handleShelfChange: handleShelfChangeDB,
    bulkUpdateSwitches,
    clearAllSwitches
  } = useBestsellerSwitches(currentListDate, currentRegion.abbreviation);

  const switchesLocked = switchesLoading || Boolean(loadError);

  // Callbacks for checking switch states
  const getRemoteKey = useCallback(
    (book: BestsellerTableBook, fallbackKey: string) => book.isbn || fallbackKey,
    []
  );

  const pendingFor = useCallback(
    (type: SwitchType, remoteKey: string) => Boolean(pendingSwitches[`${type}|${remoteKey}`]),
    [pendingSwitches]
  );

  const mutationFor = useCallback(
    (type: SwitchType, remoteKey: string): MutationStatus =>
      mutationStatus[`${type}|${remoteKey}`],
    [mutationStatus]
  );

  const bulkPosDisabled = switchesLocked || bulkPending.pos;
  const bulkShelfDisabled = switchesLocked || bulkPending.shelf;
  const posBulkLabel = bulkPosDisabled
    ? 'POS switches loading, please wait'
    : 'Toggle all POS switches';
  const shelfBulkLabel = bulkShelfDisabled
    ? 'Shelf switches loading, please wait'
    : 'Toggle all shelf switches';

  // Legacy local storage state for backwards compatibility (non-staff users)
  const [localPosChecked, setLocalPosChecked] = useState<SwitchState>({});
  const [localShelfChecked, setLocalShelfChecked] = useState<SwitchState>({});

  // UI state
  const [isOpen, setIsOpen] = useState(true);
  const [sortBy, setSortBy] = useState<SortOrder>('default');
  const [allPosChecked, setAllPosChecked] = useState(false);
  const [allShelfChecked, setAllShelfChecked] = useState(false);

  // Load legacy localStorage data on mount
  useEffect(() => {
    const savedPosData = localStorage.getItem('bestseller-pos-data');
    const savedShelfData = localStorage.getItem('bestseller-shelf-data');

    if (savedPosData) {
      setLocalPosChecked(JSON.parse(savedPosData));
    }
    if (savedShelfData) {
      setLocalShelfChecked(JSON.parse(savedShelfData));
    }
  }, []);

  // Save legacy localStorage data
  useEffect(() => {
    localStorage.setItem('bestseller-pos-data', JSON.stringify(localPosChecked));
  }, [localPosChecked]);

  useEffect(() => {
    localStorage.setItem('bestseller-shelf-data', JSON.stringify(localShelfChecked));
  }, [localShelfChecked]);

  // Handle POS checkbox change
  const handlePosChange = useCallback(
    async (bookKey: string, book: BestsellerTableBook, checked: boolean) => {
      if (isPbnStaff) {
        const remoteKey = getRemoteKey(book, bookKey);
        await handlePosChangeDB(remoteKey, book.title, checked);
      } else {
        setLocalPosChecked((prev) => ({ ...prev, [bookKey]: checked }));
      }
    },
    [getRemoteKey, handlePosChangeDB, isPbnStaff]
  );

  // Handle shelf checkbox change
  const handleShelfChange = useCallback(
    async (bookKey: string, book: BestsellerTableBook, checked: boolean) => {
      if (isPbnStaff) {
        const remoteKey = getRemoteKey(book, bookKey);
        await handleShelfChangeDB(remoteKey, book.title, checked);
      } else {
        setLocalShelfChecked((prev) => ({ ...prev, [bookKey]: checked }));
      }
    },
    [getRemoteKey, handleShelfChangeDB, isPbnStaff]
  );

  // Clear all switching data
  const clearSwitchingData = async () => {
    if (isPbnStaff) {
      await clearAllSwitches();
    } else {
      setLocalPosChecked({});
      setLocalShelfChecked({});
      localStorage.removeItem('bestseller-pos-data');
      localStorage.removeItem('bestseller-shelf-data');
      toast({
        title: 'Cleared',
        description: 'All switching values have been cleared'
      });
    }
    onSwitchingDataClear?.();
  };

  // Copy ISBN to clipboard
  const copyISBN = async (isbn: string) => {
    try {
      await navigator.clipboard.writeText(isbn);
      toast({
        title: 'Copied!',
        description: `ISBN ${isbn} copied to clipboard`
      });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Unable to copy to clipboard',
        variant: 'destructive'
      });
    }
  };

  // Sort books based on current sort setting and audience filtering
  const sortedBooks = useMemo(
    () => sortBooks(category.books as BestsellerTableBook[], sortBy, isAudienceFiltered),
    [category.books, sortBy, isAudienceFiltered]
  );

  // Get the appropriate checked states based on currently visible books
  const effectivePosChecked = useMemo(() => {
    if (isPbnStaff) {
      // For database storage, use ISBN as key and check against currently visible books
      const dbChecked: SwitchState = {};
      sortedBooks.forEach((book, index) => {
        const bookKey = getBookKey(book, index);
        const isbn = book.isbn || bookKey;
        if (posChecked[isbn]) {
          dbChecked[bookKey] = posChecked[isbn];
        }
      });
      return dbChecked;
    }
    return localPosChecked;
  }, [isPbnStaff, sortedBooks, posChecked, localPosChecked]);

  const effectiveShelfChecked = useMemo(() => {
    if (isPbnStaff) {
      // For database storage, use ISBN as key and check against currently visible books
      const dbChecked: SwitchState = {};
      sortedBooks.forEach((book, index) => {
        const bookKey = getBookKey(book, index);
        const isbn = book.isbn || bookKey;
        if (shelfChecked[isbn]) {
          dbChecked[bookKey] = shelfChecked[isbn];
        }
      });
      return dbChecked;
    }
    return localShelfChecked;
  }, [isPbnStaff, sortedBooks, shelfChecked, localShelfChecked]);

  // Handle bulk POS selection
  const handleBulkPosChange = useCallback(
    async (checked: boolean) => {
      setAllPosChecked(checked);

      if (isPbnStaff) {
        const targets = sortedBooks
          .filter(isEligibleForSwitching)
          .map((book, index) => ({
            key: getRemoteKey(book, getBookKey(book, index)),
            title: book.title
          }));

        await bulkUpdateSwitches('pos', targets, checked);
      } else {
        const newPosChecked: SwitchState = {};
        sortedBooks.forEach((book, index) => {
          const bookKey = getBookKey(book, index);
          if (isEligibleForSwitching(book)) {
            newPosChecked[bookKey] = checked;
          }
        });
        setLocalPosChecked((prev) => ({ ...prev, ...newPosChecked }));
      }
    },
    [bulkUpdateSwitches, getRemoteKey, isPbnStaff, sortedBooks]
  );

  // Handle bulk Shelf selection
  const handleBulkShelfChange = useCallback(
    async (checked: boolean) => {
      setAllShelfChecked(checked);

      if (isPbnStaff) {
        const targets = sortedBooks.map((book, index) => ({
          key: getRemoteKey(book, getBookKey(book, index)),
          title: book.title
        }));

        await bulkUpdateSwitches('shelf', targets, checked);
      } else {
        const newShelfChecked: SwitchState = {};
        sortedBooks.forEach((book, index) => {
          const bookKey = getBookKey(book, index);
          newShelfChecked[bookKey] = checked;
        });
        setLocalShelfChecked((prev) => ({ ...prev, ...newShelfChecked }));
      }
    },
    [bulkUpdateSwitches, getRemoteKey, isPbnStaff, sortedBooks]
  );

  // Update bulk checkbox states based on individual checkbox states
  useEffect(() => {
    const eligibleBooks = sortedBooks.filter(isEligibleForSwitching);
    const eligibleBookKeys = eligibleBooks.map((book, index) => getBookKey(book, index));

    // Check POS bulk state
    if (eligibleBookKeys.length > 0) {
      const posCheckedCount = eligibleBookKeys.filter((key) => effectivePosChecked[key]).length;
      setAllPosChecked(posCheckedCount === eligibleBookKeys.length);
    } else {
      setAllPosChecked(false);
    }

    // Check Shelf bulk state
    if (eligibleBookKeys.length > 0) {
      const shelfCheckedCount = eligibleBookKeys.filter(
        (key) => effectiveShelfChecked[key]
      ).length;
      setAllShelfChecked(shelfCheckedCount === eligibleBookKeys.length);
    } else {
      setAllShelfChecked(false);
    }
  }, [sortedBooks, effectivePosChecked, effectiveShelfChecked]);

  // Check if any books in this category have switching values set
  const hasValues = useMemo(() => {
    return sortedBooks.some((book, index) => {
      const bookKey = getBookKey(book, index);
      return effectivePosChecked[bookKey] || effectiveShelfChecked[bookKey];
    });
  }, [sortedBooks, effectivePosChecked, effectiveShelfChecked]);

  return (
    <Card className="mb-6">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CategoryHeader
          categoryName={category.name}
          bookCount={category.books.filter((book) => !book.wasDropped).length}
          isOpen={isOpen}
          onToggle={() => setIsOpen(!isOpen)}
          isPbnStaff={isPbnStaff}
          hasValues={hasValues}
          onClearSwitching={clearSwitchingData}
          isMobile={isMobile}
        />
        <CollapsibleContent>
          <CardContent>
            <Table>
              <TableHeader
                isAudienceFiltered={isAudienceFiltered}
                isMobile={isMobile}
                isPbnStaff={isPbnStaff}
                sortBy={sortBy}
                onSortChange={() => setSortBy(sortBy === 'title' ? 'default' : 'title')}
                allPosChecked={allPosChecked}
                allShelfChecked={allShelfChecked}
                onBulkPosChange={handleBulkPosChange}
                onBulkShelfChange={handleBulkShelfChange}
                bulkPosDisabled={bulkPosDisabled}
                bulkShelfDisabled={bulkShelfDisabled}
                posBulkLabel={posBulkLabel}
                shelfBulkLabel={shelfBulkLabel}
                switchesLoading={switchesLoading}
                bulkPending={bulkPending}
              />
              <TableBody>
                {sortedBooks.map((book, index) => {
                  const bookKey = getBookKey(book, index);
                  const isEligible = isEligibleForSwitching(book);

                  return (
                    <BookRow
                      key={bookKey}
                      book={book}
                      bookKey={bookKey}
                      isAudienceFiltered={isAudienceFiltered}
                      isMobile={isMobile}
                      isPbnStaff={isPbnStaff}
                      effectivePosChecked={effectivePosChecked}
                      effectiveShelfChecked={effectiveShelfChecked}
                      isEligible={isEligible}
                      switchesLocked={switchesLocked}
                      bulkPending={bulkPending}
                      onPosChange={handlePosChange}
                      onShelfChange={handleShelfChange}
                      onCopyISBN={copyISBN}
                      getRemoteKey={getRemoteKey}
                      pendingFor={pendingFor}
                      mutationFor={mutationFor}
                    />
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
      {isPbnStaff && loadError && (
        <Alert variant="destructive" className="mb-4" role="alert">
          <AlertTitle>Switch controls unavailable</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span>{loadError}</span>
            <Button variant="secondary" size="sm" onClick={retryLoad} disabled={switchesLoading}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </Card>
  );
};
