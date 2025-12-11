import { BestsellerBook } from '@/types/bestseller';

/**
 * Extended book type with additional list metadata
 */
export interface BestsellerTableBook extends BestsellerBook {
  listName?: string;
}

/**
 * Type of switch control (POS or Shelf)
 */
export type SwitchType = 'pos' | 'shelf';

/**
 * Status of a mutation operation
 */
export type MutationStatus = 'success' | 'error' | undefined;

/**
 * State of checked switches (keyed by book key)
 */
export interface SwitchState {
  [bookKey: string]: boolean;
}

/**
 * Pending state for mutations (keyed by "type|remoteKey")
 */
export interface PendingState {
  [key: string]: boolean;
}

/**
 * Mutation status for operations (keyed by "type|remoteKey")
 */
export interface MutationStatusMap {
  [key: string]: MutationStatus;
}

/**
 * Bulk pending state for switch types
 */
export interface BulkPendingState {
  pos: boolean;
  shelf: boolean;
}

/**
 * Rank change type indicator
 */
export type RankChangeType = 'new' | 'dropped' | 'up' | 'down' | 'unchanged';

/**
 * Sort order options
 */
export type SortOrder = 'default' | 'title';

/**
 * Props for the main BestsellerTable component
 */
export interface BestsellerTableRootProps {
  categoryName: string;
  books: BestsellerTableBook[];
  onSwitchingDataClear?: () => void;
  isAudienceFiltered?: boolean;
  listDate?: string;
}

/**
 * Props for the TableHeader component
 */
export interface TableHeaderProps {
  isAudienceFiltered: boolean;
  isMobile: boolean;
  isPbnStaff: boolean;
  sortBy: SortOrder;
  onSortChange: () => void;
  allPosChecked: boolean;
  allShelfChecked: boolean;
  onBulkPosChange: (checked: boolean) => void;
  onBulkShelfChange: (checked: boolean) => void;
  bulkPosDisabled: boolean;
  bulkShelfDisabled: boolean;
  posBulkLabel: string;
  shelfBulkLabel: string;
  switchesLoading: boolean;
  bulkPending: BulkPendingState;
}

/**
 * Props for the BookRow component
 */
export interface BookRowProps {
  book: BestsellerTableBook;
  bookKey: string;
  isAudienceFiltered: boolean;
  isMobile: boolean;
  isPbnStaff: boolean;
  effectivePosChecked: SwitchState;
  effectiveShelfChecked: SwitchState;
  isEligible: boolean;
  switchesLocked: boolean;
  bulkPending: BulkPendingState;
  onPosChange: (bookKey: string, book: BestsellerTableBook, checked: boolean) => void;
  onShelfChange: (bookKey: string, book: BestsellerTableBook, checked: boolean) => void;
  onCopyISBN: (isbn: string) => void;
  getRemoteKey: (book: BestsellerTableBook, fallbackKey: string) => string;
  pendingFor: (type: SwitchType, remoteKey: string) => boolean;
  mutationFor: (type: SwitchType, remoteKey: string) => MutationStatus;
}

/**
 * Props for the SwitchControls component
 */
export interface SwitchControlsProps {
  type: SwitchType;
  checked: boolean;
  disabled: boolean;
  pending: boolean;
  status: MutationStatus;
  bookTitle: string;
  isMobile: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * Props for the BookInfoCell component
 */
export interface BookInfoCellProps {
  book: BestsellerTableBook;
  onCopyISBN: (isbn: string) => void;
}

/**
 * Props for the RankChangeCell component
 */
export interface RankChangeCellProps {
  book: BestsellerTableBook;
}

/**
 * Props for the CategoryHeader component
 */
export interface CategoryHeaderProps {
  categoryName: string;
  bookCount: number;
  isOpen: boolean;
  onToggle: () => void;
  isPbnStaff: boolean;
  hasValues: boolean;
  onClearSwitching: () => void;
  isMobile: boolean;
}
