/**
 * Elsewhere Discovery Page
 *
 * Displays books that are bestselling in other regions but have NOT ONCE
 * appeared on the selected region's lists in the past year.
 *
 * Features:
 * - Grid layout of book cards
 * - Regional filters and sorting (default: Newest)
 * - Search functionality
 * - Performance metrics across regions
 */

import { useState, useEffect } from 'react';
import { ElsewhereBookCard } from '@/components/ElsewhereBookCard';
import { ElsewhereFilters } from '@/components/ElsewhereFilters';
import { useRegion } from '@/hooks/useRegion';
import { useElsewhereData } from '@/hooks/useElsewhereData';
import { ElsewhereFilters as ElsewhereFiltersType, ElsewhereBook } from '@/types/elsewhere';
import { REGIONS } from '@/config/regions';
import { fetchGoogleBooksCoversBatch } from '@/services/googleBooksApi';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { SortOption } from '@/types/elsewhere';

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'most_regions', label: 'Most Regions' },
  { value: 'best_rank', label: 'Best Rank' },
  { value: 'total_weeks', label: 'Total Weeks' },
];

export default function Elsewhere() {
  const { currentRegion } = useRegion();

  // Initialize filters with current region and all other active regions
  const [filters, setFilters] = useState<ElsewhereFiltersType>({
    targetRegion: currentRegion.abbreviation,
    comparisonRegions: REGIONS
      .filter(r => r.is_active && r.abbreviation !== currentRegion.abbreviation)
      .map(r => r.abbreviation),
    sortBy: 'newest',
    page: 1,
    pageSize: 20,
    showOnlyNewThisWeek: false,
  });

  // Update target region when context changes
  useEffect(() => {
    if (filters.targetRegion !== currentRegion.abbreviation) {
      const newComparisonRegions = REGIONS
        .filter(r => r.is_active && r.abbreviation !== currentRegion.abbreviation)
        .map(r => r.abbreviation);

      console.log('[Elsewhere] Updating filters:', {
        targetRegion: currentRegion.abbreviation,
        comparisonRegions: newComparisonRegions,
      });

      setFilters(prev => ({
        ...prev,
        targetRegion: currentRegion.abbreviation,
        comparisonRegions: newComparisonRegions,
      }));
    }
  }, [currentRegion.abbreviation, filters.targetRegion]);

  // Fetch data with filters
  const { books, totalCount, isLoading, error, refetch, page, pageSize, totalPages } = useElsewhereData(filters);

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
    // Scroll to top when changing pages
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // State for books enriched with cover URLs
  const [enrichedBooks, setEnrichedBooks] = useState<ElsewhereBook[]>([]);
  const [isLoadingCovers, setIsLoadingCovers] = useState(false);

  // Fetch cover URLs when books change (debounced to avoid hammering during filter changes)
  useEffect(() => {
    // Debounce cover enrichment by 300ms to avoid rapid re-fetching during filter changes
    const timeoutId = setTimeout(() => {
      const enrichWithCovers = async () => {
        if (books.length === 0) {
          setEnrichedBooks([]);
          setIsLoadingCovers(false);
          return;
        }

        setIsLoadingCovers(true);
        try {
          const isbns = books.map(b => b.isbn);
          const covers = await fetchGoogleBooksCoversBatch(isbns);

          const enriched = books.map(book => ({
            ...book,
            coverUrl: covers[book.isbn],
          }));

          setEnrichedBooks(enriched);
        } catch (err) {
          console.error('Failed to fetch cover URLs:', err);
          // Fallback to books without covers
          setEnrichedBooks(books);
        } finally {
          setIsLoadingCovers(false);
        }
      };

      enrichWithCovers();
    }, 300); // 300ms debounce delay

    // Cleanup: cancel pending fetch if books change again before timeout
    return () => {
      clearTimeout(timeoutId);
      // Show loading state during debounce period if we have books
      if (books.length > 0) {
        setIsLoadingCovers(true);
      }
    };
  }, [books]);

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Header */}
        <header className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
             Books from Elsewhere
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                Discover bestselling books from other regions that have NOT ONCE appeared on {currentRegion.display_name} lists in the past year
              </p>
            </div>
            {!isLoading && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            )}
          </div>
        </header>

        {/* Main Content */}
        <div className="grid md:grid-cols-[300px_1fr] gap-8">
          {/* Filters Sidebar - Hidden on mobile, visible on tablet and desktop */}
          <aside className="hidden md:block space-y-6">
            <ElsewhereFilters
              filters={filters}
              onFiltersChange={setFilters}
            />

            {/* Results Summary */}
            {!isLoading && !error && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Results</p>
                    <p className="text-2xl font-bold">{totalCount}</p>
                    <p className="text-xs text-muted-foreground">
                      {totalCount === 1 ? 'book' : 'books'} from {filters.comparisonRegions.length} {filters.comparisonRegions.length === 1 ? 'region' : 'regions'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>

          {/* Book Grid */}
          <main>
            {/* Loading State */}
            {isLoading && (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="flex flex-col">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex gap-4">
                        <Skeleton className="w-20 h-28" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-6 w-16" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-8 w-full" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Error State */}
            {error && !isLoading && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error loading books</AlertTitle>
                <AlertDescription>
                  {error.message || 'Failed to load books from other regions. Please try again.'}
                </AlertDescription>
              </Alert>
            )}

            {/* Empty State */}
            {!isLoading && !error && totalCount === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground mb-4">
                    No books found matching your filters.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Try adjusting your filters or selecting more regions to compare.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Book Grid */}
            {!isLoading && !error && totalCount > 0 && (
              <div className="space-y-6">
                {/* Sort dropdown and result count */}
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} {totalCount === 1 ? 'result' : 'results'}
                  </p>
                  <Select
                    value={filters.sortBy}
                    onValueChange={(value) => setFilters(prev => ({ ...prev, sortBy: value as SortOption, page: 1 }))}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SORT_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Grid - Single column until container > 600px */}
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {enrichedBooks.map((book) => (
                    <ElsewhereBookCard
                      key={book.isbn}
                      book={book}
                      targetRegion={currentRegion.abbreviation}
                    />
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(page - 1)}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>

                    <div className="flex items-center gap-1">
                      {/* Show first page */}
                      {page > 3 && (
                        <>
                          <Button
                            variant={page === 1 ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handlePageChange(1)}
                          >
                            1
                          </Button>
                          {page > 4 && <span className="px-2">...</span>}
                        </>
                      )}

                      {/* Show pages around current */}
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => Math.abs(p - page) <= 2)
                        .map(p => (
                          <Button
                            key={p}
                            variant={p === page ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handlePageChange(p)}
                          >
                            {p}
                          </Button>
                        ))}

                      {/* Show last page */}
                      {page < totalPages - 2 && (
                        <>
                          {page < totalPages - 3 && <span className="px-2">...</span>}
                          <Button
                            variant={page === totalPages ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handlePageChange(totalPages)}
                          >
                            {totalPages}
                          </Button>
                        </>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(page + 1)}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>

                    <span className="text-sm text-muted-foreground ml-4">
                      Page {page} of {totalPages}
                    </span>
                  </div>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
