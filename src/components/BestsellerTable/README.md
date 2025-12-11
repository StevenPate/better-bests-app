# BestsellerTable Component Architecture

## Overview

The BestsellerTable component has been refactored into a modular, composable architecture with clear separation of concerns, strong TypeScript typing, and improved testability.

## Directory Structure

```
BestsellerTable/
├── index.tsx              # Main BestsellerTable component
├── types.ts               # TypeScript type definitions
├── utils.ts               # Utility functions with strong typing
├── utils.test.ts          # Unit tests for utilities
├── BookInfoCell.tsx       # Book title, author, ISBN display
├── BookRow.tsx            # Individual table row component
├── CategoryHeader.tsx     # Collapsible category header
├── RankChangeCell.tsx     # Rank change indicator
├── SwitchControls.tsx     # POS/Shelf checkbox controls
├── TableHeader.tsx        # Table header with bulk controls
└── README.md              # This file
```

## Component Architecture

### Main Component: `index.tsx`

**Responsibilities:**
- State management (sorting, bulk selection, collapsible)
- Integration with hooks (auth, mobile, switches)
- Data transformation (sorting, filtering)
- Event handling (POS/Shelf changes, bulk operations)
- Legacy localStorage support for non-staff users

**Key Features:**
- Uses React Query patterns via `useBestsellerSwitches` hook
- Memoized computations for performance
- Type-safe with no `any` types
- Clean separation between database and local storage logic

### Subcomponents

#### `CategoryHeader.tsx`
Displays the category name, book count, and optional "Clear Switching Values" button.

**Props:**
- `categoryName`: Category display name
- `bookCount`: Number of books in category
- `isOpen`: Collapsible state
- `onToggle`: Toggle handler
- `isPbnStaff`: Staff status flag
- `hasValues`: Whether any books have switching values set
- `onClearSwitching`: Clear handler
- `isMobile`: Mobile view flag

#### `TableHeader.tsx`
Renders the table header row with sortable columns and bulk selection checkboxes.

**Props:**
- `isAudienceFiltered`: Audience filtering flag
- `isMobile`: Mobile view flag
- `isPbnStaff`: Staff status flag
- `sortBy`: Current sort order
- `onSortChange`: Sort toggle handler
- `allPosChecked`: Bulk POS checkbox state
- `allShelfChecked`: Bulk Shelf checkbox state
- `onBulkPosChange`: Bulk POS change handler
- `onBulkShelfChange`: Bulk Shelf change handler
- `bulkPosDisabled`: POS disabled state
- `bulkShelfDisabled`: Shelf disabled state
- `posBulkLabel`: Accessible label for POS bulk control
- `shelfBulkLabel`: Accessible label for Shelf bulk control
- `switchesLoading`: Loading state
- `bulkPending`: Pending state for bulk operations

#### `BookRow.tsx`
Renders a single table row with all book information and controls.

**Props:**
- `book`: Book data with extended metadata
- `bookKey`: Unique identifier for the row
- `isAudienceFiltered`: Audience filtering flag
- `isMobile`: Mobile view flag
- `isPbnStaff`: Staff status flag
- `effectivePosChecked`: POS checkbox states
- `effectiveShelfChecked`: Shelf checkbox states
- `isEligible`: Whether book is eligible for switching
- `switchesLocked`: Whether switches are locked
- `bulkPending`: Bulk operation states
- `onPosChange`: POS change handler
- `onShelfChange`: Shelf change handler
- `onCopyISBN`: ISBN copy handler
- `getRemoteKey`: Remote key generator
- `pendingFor`: Pending state checker
- `mutationFor`: Mutation status getter

#### `BookInfoCell.tsx`
Displays book title (linked if ISBN exists), author, and ISBN with copy button.

**Props:**
- `book`: Book data
- `onCopyISBN`: ISBN copy handler

#### `RankChangeCell.tsx`
Shows the rank change indicator with appropriate icon and text.

**Props:**
- `book`: Book data

#### `SwitchControls.tsx`
Renders a POS or Shelf checkbox with loading and status indicators.

**Props:**
- `type`: 'pos' or 'shelf'
- `checked`: Checkbox state
- `disabled`: Disabled state
- `pending`: Loading state
- `status`: Mutation status ('success', 'error', or undefined)
- `bookTitle`: Book title for accessibility
- `isMobile`: Mobile view flag
- `onChange`: Change handler

## Type Definitions

### Core Types (`types.ts`)

- **`BestsellerTableBook`**: Extended book type with optional `listName` property
- **`SwitchType`**: Union type for 'pos' | 'shelf'
- **`MutationStatus`**: Union type for 'success' | 'error' | undefined
- **`SwitchState`**: Record mapping book keys to boolean states
- **`PendingState`**: Record mapping operation keys to pending states
- **`MutationStatusMap`**: Record mapping operation keys to mutation statuses
- **`BulkPendingState`**: Object with pos and shelf boolean flags
- **`RankChangeType`**: Union for 'new' | 'dropped' | 'up' | 'down' | 'unchanged'
- **`SortOrder`**: Union for 'default' | 'title'

## Utility Functions

### Book Utilities (`utils.ts`)

- **`getBookKey(book, index)`**: Generate unique key for a book
- **`isEligibleForSwitching(book)`**: Check if book is eligible for POS/Shelf switching
- **`getRankChangeType(book)`**: Determine rank change type
- **`getRankChangeIcon(book)`**: Get appropriate icon component
- **`getRankChangeIconClasses(book)`**: Get icon CSS classes
- **`getRankChangeText(book)`**: Get rank change display text
- **`getRowClassName(book)`**: Get table row CSS classes
- **`sortBooks(books, sortBy, isAudienceFiltered)`**: Sort books array
- **`cleanTitleForSorting(title)`**: Remove articles from title for sorting

All utility functions are:
- Fully typed with no `any` types
- Pure functions with no side effects
- Covered by comprehensive unit tests

## Testing

### Current Coverage

- **Utils**: 100% coverage with 30 passing tests
- Covers all utility functions
- Tests edge cases and various book states
- Validates sorting and filtering logic

### Test Strategy

- **Unit Tests**: Isolated testing of utility functions
- **Component Tests**: (Pending) Testing of individual components
- **Integration Tests**: Existing BestsellerTable.test.tsx covers full integration

## Accessibility

All components maintain or improve accessibility:
- Semantic HTML (`<table>`, `<thead>`, `<tbody>`, `<th scope>`)
- ARIA labels for interactive controls
- `aria-live` regions for dynamic updates
- Keyboard navigation support
- Screen reader friendly loading states

## Migration Guide

### For Consumers

The public API remains unchanged:

```tsx
import { BestsellerTable } from '@/components/BestsellerTable';

<BestsellerTable
  category={category}
  onSwitchingDataClear={handleClear}
  isAudienceFiltered={false}
  listDate="2025-10-16"
/>
```

### For Contributors

To add new functionality:

1. **New Utility Function**: Add to `utils.ts` with TypeScript types and tests
2. **New Component**: Create in BestsellerTable/ directory with proper typing
3. **New Type**: Add to `types.ts` with JSDoc documentation
4. **Styling**: Use Tailwind classes, maintain responsive patterns

## Benefits of Refactoring

1. **Type Safety**: Eliminated all `any` types, now 100% type-safe
2. **Testability**: Pure utility functions easy to test in isolation
3. **Maintainability**: Clear separation of concerns, small focused components
4. **Reusability**: Subcomponents can be reused in other contexts
5. **Performance**: Memoized computations prevent unnecessary re-renders
6. **Developer Experience**: Better IntelliSense, compile-time error detection

## Future Enhancements

Potential areas for improvement:
- Add Storybook stories for visual component documentation
- Implement React Testing Library tests for subcomponents
- Extract table virtualization for very large lists
- Add keyboard shortcuts for power users
- Support additional sort orders (author, weeks on list)
