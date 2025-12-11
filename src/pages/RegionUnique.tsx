/**
 * Region Unique Books Page
 *
 * Displays books that have appeared ONLY on the selected region's bestseller lists
 * in the past year, with no appearances on any other region's lists during that
 * same year.
 *
 * Features:
 * - Grid layout of book cards
 * - Search functionality
 * - Sort by newest first, most weeks, or best rank
 */

import { useState, useEffect } from 'react';
import { ElsewhereBookCard } from '@/components/ElsewhereBookCard';
import { useRegion } from '@/hooks/useRegion';
import { useUniqueBooks } from '@/hooks/useUniqueBooks';
import { fetchGoogleBooksCoversBatch } from '@/services/googleBooksApi';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { AlertCircle, RefreshCw, Search } from 'lucide-react';

type SortOption = 'newest_first' | 'most_weeks' | 'best_rank';

const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'newest_first', label: 'Newest First' },
  { value: 'most_weeks', label: 'Most Weeks' },
  { value: 'best_rank', label: 'Best Rank' },
];

export default function RegionUnique() {
  const { currentRegion } = useRegion();
  const { books, totalCount, isLoading, error, refetch } = useUniqueBooks(currentRegion.abbreviation);

  const [sortBy, setSortBy] = useState<SortOption>('newest_first');
  const [searchTerm, setSearchTerm] = useState('');

  // State for books enriched with cover URLs
  const [enrichedBooks, setEnrichedBooks] = useState<typeof books>([]);
  const [isLoadingCovers, setIsLoadingCovers] = useState(false);

  // Apply filtering and sorting
  const filteredAndSortedBooks = enrichedBooks
    .filter(book => {
      // Apply search filter
      if (!searchTerm) return true;
      const search = searchTerm.toLowerCase();
      return (
        book.title.toLowerCase().includes(search) ||
        book.author.toLowerCase().includes(search) ||
        book.isbn.includes(search)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'newest_first') {
        return b.firstSeen.localeCompare(a.firstSeen);
      } else if (sortBy === 'most_weeks') {
        return b.weeksOnList - a.weeksOnList;
      } else {
        return a.bestRank - b.bestRank;
      }
    });

  // Fetch cover URLs when books change (debounced to avoid hammering during filter changes)
  useEffect(() => {
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

    return () => {
      clearTimeout(timeoutId);
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
             Unique to {currentRegion.display_name}
              </h1>
              <p className="text-lg text-muted-foreground mt-2">
                Books that appeared ONLY on {currentRegion.display_name} lists in the past year with no appearances on any other regional lists
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

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-6">
            {/* Loading Message - Fixed height to prevent layout shift */}
            <div className="min-h-[3rem] flex items-center justify-center">
              <p className="text-sm text-muted-foreground animate-pulse">
                Loading unique books for {currentRegion.display_name}...
              </p>
            </div>
            <div className="flex gap-4">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-[180px]" />
            </div>
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
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !isLoading && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error loading unique books</AlertTitle>
            <AlertDescription>
              {error.message || 'Failed to load unique books. Please try again.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Empty State */}
        {!isLoading && !error && totalCount === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                No unique books found for {currentRegion.display_name}.
              </p>
              <p className="text-sm text-muted-foreground">
                All books that appeared on {currentRegion.display_name} in the past year have also appeared on other regional lists.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {!isLoading && !error && totalCount > 0 && (
          <div className="space-y-6">
            {/* Empty container for layout consistency - prevents shift when loading completes */}
            <div className="min-h-[3rem]" aria-hidden="true" />

            {/* Search and Sort Controls */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by title, author, or ISBN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectTrigger className="w-full sm:w-[180px]">
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

            {/* Result Count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {filteredAndSortedBooks.length === totalCount
                  ? `${totalCount} ${totalCount === 1 ? 'book' : 'books'} unique to ${currentRegion.display_name}`
                  : `Showing ${filteredAndSortedBooks.length} of ${totalCount} books`}
              </p>
            </div>

            {/* Book Grid */}
            {filteredAndSortedBooks.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    No books match your search criteria.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredAndSortedBooks.map((book) => (
                  <ElsewhereBookCard
                    key={book.isbn}
                    book={{
                      isbn: book.isbn,
                      title: book.title,
                      author: book.author,
                      publisher: book.publisher,
                      category: book.category,
                      coverUrl: (book as any).coverUrl,
                      regionalPerformance: [
                        {
                          region: currentRegion.abbreviation,
                          currentRank: book.currentRank,
                          weeksOnList: book.weeksOnList,
                          bestRank: book.bestRank,
                          trend: 'stable' as const,
                          category: book.category,
                        },
                      ],
                      aggregateMetrics: {
                        totalRegions: 1,
                        totalWeeksAcrossAllRegions: book.weeksOnList,
                        bestRankAchieved: book.bestRank,
                        averageRank: book.bestRank,
                      },
                      firstSeenDate: book.firstSeen,
                      lastSeenDate: book.lastSeen,
                    }}
                    targetRegion={currentRegion.abbreviation}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
