import { BestsellerTable } from "@/components/BestsellerTable";
import { BestsellerList } from "@/types/bestseller";
import { EmptyState } from "@/components/ui/status";
import { Filter, Search } from "lucide-react";
import { matchesAllFilters } from "@/utils/bookFilters";

interface BookListDisplayProps {
  bestsellerData: BestsellerList;
  filter: string;
  audienceFilter: string;
  searchTerm: string;
  bookAudiences: Record<string, string>;
  isPbnStaff: boolean;
  onSwitchingDataClear: () => void;
  onResetFilters?: () => void;
}

/**
 * Book list display component with filtering and search
 *
 * Displays bestseller books in table or card format with support for:
 * - Add/drop/search filtering using shared filter utilities
 * - Audience classification (Adult/Teen/Children) for PBN staff
 * - Responsive mobile/desktop layouts
 * - Staff-only features (ISBN copying, POS/shelf checkboxes)
 *
 * The component has two display modes:
 * 1. Normal: Shows categories separately with filtering
 * 2. Audience-filtered (staff only): Aggregates all books matching audience
 *
 * @param {BookListDisplayProps} props - Component props
 * @param {BestsellerList} props.bestsellerData - Bestseller data with categories
 * @param {string} props.filter - Active filter (all/adds/drops/adds-drops/no-drops)
 * @param {string} props.audienceFilter - Active audience filter (all/A/T/C)
 * @param {string} props.searchTerm - Search query for title/author/ISBN
 * @param {Record<string, string>} props.bookAudiences - ISBN to audience classification map
 * @param {boolean} props.isPbnStaff - Whether user has PBN staff privileges
 * @param {Function} props.onSwitchingDataClear - Callback to clear switching data
 * @param {Function} [props.onResetFilters] - Optional callback to reset all filters
 * @returns Filtered book list with appropriate layout
 *
 * @example
 * ```tsx
 * <BookListDisplay
 *   bestsellerData={data}
 *   filter="adds"
 *   audienceFilter="A"
 *   searchTerm="gatsby"
 *   bookAudiences={audiences}
 *   isPbnStaff={true}
 *   onSwitchingDataClear={clearSwitches}
 *   onResetFilters={resetFilters}
 * />
 * ```
 */
export const BookListDisplay = ({
  bestsellerData,
  filter,
  audienceFilter,
  searchTerm,
  bookAudiences,
  isPbnStaff,
  onSwitchingDataClear,
  onResetFilters
}: BookListDisplayProps) => {

  // Shared filter function using bookFilters utilities
  const filterBooks = (books: any[]) => {
    return books.filter(book =>
      matchesAllFilters(book, {
        filter,
        audiences: bookAudiences,
        audienceFilter: null, // Not used in general filtering
        searchTerm,
      })
    );
  };

  // Combined view for audience filtering (PBN Staff only)
  if (audienceFilter !== "all" && isPbnStaff) {
    const allFilteredBooks = bestsellerData.categories.flatMap(category =>
      category.books
        .filter(book =>
          matchesAllFilters(book, {
            filter,
            audiences: bookAudiences,
            audienceFilter,
            searchTerm,
          })
        )
        .map(book => ({ ...book, listName: category.name }))
    );

    const audienceName = audienceFilter === "A" ? "Adult" : audienceFilter === "T" ? "Teen" : "Children";

    if (allFilteredBooks.length === 0) {
      const hasActiveFilters = filter !== "all" || searchTerm.trim() !== "";

      return (
        <EmptyState
          title={hasActiveFilters ? `No ${audienceName.toLowerCase()} books match your filters` : `No ${audienceName.toLowerCase()} books found`}
          description={
            hasActiveFilters
              ? searchTerm
                ? `Try adjusting your search term or filters to find what you're looking for.`
                : `Try selecting a different filter to see more books.`
              : `There are no books classified as "${audienceName}" in the current list.`
          }
          icon={hasActiveFilters ? <Filter /> : <Search />}
          actions={
            hasActiveFilters && onResetFilters
              ? [{ label: "Reset Filters", onClick: onResetFilters, variant: "outline" }]
              : undefined
          }
        />
      );
    }
    
    return (
      <BestsellerTable 
        key={`audience-${audienceFilter}`}
        category={{
          name: `${audienceName} Books`,
          books: allFilteredBooks
        }}
        onSwitchingDataClear={onSwitchingDataClear}
        isAudienceFiltered={true}
        listDate={bestsellerData.date}
      />
    );
  }

  // Normal category view
  const categoriesWithBooks = bestsellerData.categories
    .map((category) => ({
      category,
      filteredBooks: filterBooks(category.books),
    }))
    .filter((item) => item.filteredBooks.length > 0);

  // Show empty state if all categories are filtered out
  if (categoriesWithBooks.length === 0) {
    const hasActiveFilters = filter !== "all" || searchTerm.trim() !== "";

    return (
      <EmptyState
        title={hasActiveFilters ? "No books match your filters" : "No books available"}
        description={
          hasActiveFilters
            ? searchTerm
              ? `No books found matching "${searchTerm}". Try a different search term or adjust your filters.`
              : "Try selecting a different filter to see more books."
            : "There are no books available in the current list."
        }
        icon={hasActiveFilters ? <Filter /> : <Search />}
        actions={
          hasActiveFilters && onResetFilters
            ? [{ label: "Reset Filters", onClick: onResetFilters, variant: "outline" }]
            : undefined
        }
      />
    );
  }

  return (
    <>
      {categoriesWithBooks.map(({ category, filteredBooks }) => (
        <BestsellerTable
          key={category.name}
          category={{ ...category, books: filteredBooks }}
          onSwitchingDataClear={onSwitchingDataClear}
          isAudienceFiltered={false}
          listDate={bestsellerData.date}
        />
      ))}
    </>
  );
};