import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useBestsellerData } from "@/hooks/useBestsellerData";
import { useBookAudiences } from "@/hooks/useBookAudiences";
import { useFilters } from "@/hooks/useFilters";
import { useRegion } from "@/hooks/useRegion";
import { trackEvent } from '@/lib/analytics';
import { BookListDisplay } from "@/components/BookListDisplay";
import { ExportActions } from "@/components/ExportActions";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/status";
import { Book, X, Check, Search, Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

const Index = () => {

  // Hooks
  const { toast } = useToast();
  const { isPbnStaff } = useAuth();
  const { currentRegion } = useRegion();

  // Data layer hooks
  const {
    data: bestsellerData,
    isLoading,
    error: loadError,
    comparisonWeek,
    setComparisonWeek,
    refresh,
    clearSwitchingData,
  } = useBestsellerData();

  const { audiences: bookAudiences } = useBookAudiences(bestsellerData, currentRegion.abbreviation);

  const {
    filter,
    audienceFilter,
    searchTerm,
    setFilter,
    setAudienceFilter,
    setSearchTerm,
    resetFilters,
  } = useFilters();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
      toast({
        title: "Lists refreshed",
        description: bestsellerData
          ? `Found ${bestsellerData.categories.reduce((sum, cat) => sum + cat.books.length, 0)} books`
          : "Lists updated successfully",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Could not refresh the lists. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleComparisonWeekChange = (week: string) => {
    setComparisonWeek(week);
  };

  // Store the original current list date on first load and never change it
  const [originalCurrentDate, setOriginalCurrentDate] = useState<string | null>(null);

  // Set original date on first load
  useEffect(() => {
    if (bestsellerData?.date && !originalCurrentDate) {
      setOriginalCurrentDate(bestsellerData.date);
    }
  }, [bestsellerData?.date, originalCurrentDate]);

  // Memoize comparison week options based on the ORIGINAL current date (never changes)
  const comparisonWeekOptions = useMemo(() => {
    if (!originalCurrentDate) return [];

    const currentDate = new Date(originalCurrentDate);
    if (isNaN(currentDate.getTime())) return [];

    // Always generate the same 8 weeks based on the ORIGINAL current list date
    return Array.from({ length: 8 }).map((_, idx) => {
      const weekDate = new Date(currentDate);
      weekDate.setDate(currentDate.getDate() - (idx + 1) * 7);
      const value = weekDate.toISOString().split('T')[0];
      const label = weekDate.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      const displayText = idx === 0 ? `Previous week (${label})` : `Week ending ${label}`;

      return { value, label, displayText, isDefault: idx === 0 };
    });
  }, [originalCurrentDate]); // Only recalculate when original date is set (once)

  // Track search usage
  useEffect(() => {
    if (searchTerm.length > 0 && bestsellerData) {
      // Count results by checking all books in all categories
      const allBooks = bestsellerData.categories.flatMap(cat => cat.books);
      const filteredBooks = allBooks.filter(book =>
        book.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        book.author.toLowerCase().includes(searchTerm.toLowerCase())
      );

      trackEvent('search_performed', {
        hasResults: filteredBooks.length > 0,
        termLength: searchTerm.length
      });
    }
  }, [searchTerm, bestsellerData]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Hero Section */}
        <header className="mb-12 animate-fade-in">
          <div className="flex items-center gap-3 mb-4">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Better Bestsellers
            </h1>
            <Link to="/review/2025">
              <Badge variant="secondary" className="gap-1 hover:bg-secondary/80 transition-colors cursor-pointer">
                <Sparkles className="w-3 h-3" />
                2025 Year in Review
              </Badge>
            </Link>
          </div>
          <p className="text-lg text-muted-foreground mb-4">
            {currentRegion.full_name} bestseller lists with bells and whistles
          </p>
          <p className="text-sm text-muted-foreground">
            A parsed and formatted rendering of{' '}
            <a
              href={currentRegion.website_url}
              className="text-primary hover:text-primary/80 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              {currentRegion.abbreviation}
            </a>
            {' '}data provided by the American Booksellers Association (
            <a
              href="https://www.bookweb.org/indiebound/bestsellers/regional"
              className="text-primary hover:text-primary/80 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              available here
            </a>
            ). We use this to track and switch our displays at{' '}
            <a
              href="https://portbooknews.com"
              className="text-primary hover:text-primary/80 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Port Book and News
            </a>
            . This info is from the most-recently published list{' '}
            {bestsellerData?.date && `(for the week ending `}
            <span className="font-semibold">{bestsellerData?.date || 'loading...'}</span>
            {bestsellerData?.date && `)`}.
          </p>

          {/* Mobile Filters - Visible only on mobile */}
          <div className="space-y-4 mt-8 md:hidden">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by title or author..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filters Row */}
            <div className="flex gap-4">
              {/* Audience Filter (Staff Only) */}
              {isPbnStaff && (
                <Select value={audienceFilter} onValueChange={setAudienceFilter}>
                  <SelectTrigger
                    className={`w-[200px] ${
                      audienceFilter !== 'all' ? 'border-primary border-2' : ''
                    }`}
                    aria-label="Filter by audience (Adult, Teen, Children, or all)"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">View all audiences</SelectItem>
                    <SelectItem value="A">Adult</SelectItem>
                    <SelectItem value="T">Teen</SelectItem>
                    <SelectItem value="C">Children</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Adds/Drops Filter */}
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger
                  className={`w-[180px] ${
                    filter !== 'all' ? 'border-primary border-2' : ''
                  }`}
                  aria-label="Filter by adds, drops, or all items"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">View all items</SelectItem>
                  <SelectItem value="adds">Adds only</SelectItem>
                  <SelectItem value="drops">Drops only</SelectItem>
                  <SelectItem value="adds-drops">Adds & Drops</SelectItem>
                  <SelectItem value="no-drops">No Drops</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>

        {/* Main Layout with Sidebar */}
        <div className="grid md:grid-cols-[300px_1fr] gap-8">
          {/* Filters Sidebar - Hidden on mobile, visible on tablet and desktop */}
          <aside className="hidden md:block space-y-6">
            {/* 1. Filters: Adds/Drops + Audience */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Filter by Status</label>
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger
                      className={`w-full ${
                        filter !== 'all' ? 'border-primary border-2' : ''
                      }`}
                      aria-label="Filter by adds, drops, or all items"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">View all items</SelectItem>
                      <SelectItem value="adds">Adds only</SelectItem>
                      <SelectItem value="drops">Drops only</SelectItem>
                      <SelectItem value="adds-drops">Adds & Drops</SelectItem>
                      <SelectItem value="no-drops">No Drops</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Audience Filter (Staff Only) */}
                {isPbnStaff && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Filter by Audience</label>
                    <Select value={audienceFilter} onValueChange={setAudienceFilter}>
                      <SelectTrigger
                        className={`w-full ${
                          audienceFilter !== 'all' ? 'border-primary border-2' : ''
                        }`}
                        aria-label="Filter by audience (Adult, Teen, Children, or all)"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">View all audiences</SelectItem>
                        <SelectItem value="A">Adult</SelectItem>
                        <SelectItem value="T">Teen</SelectItem>
                        <SelectItem value="C">Children</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. Exports (Staff Only) */}
            {bestsellerData && isPbnStaff && (
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <label className="text-sm font-medium text-muted-foreground block">Export</label>
                  <ExportActions
                    region={currentRegion.abbreviation}
                    bestsellerData={bestsellerData}
                    bookAudiences={bookAudiences}
                    isPbnStaff={isPbnStaff}
                  />
                </CardContent>
              </Card>
            )}

            {/* 3. Search */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <label htmlFor="search-input" className="text-sm font-medium block">
                    Search Books
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search-input"
                      type="text"
                      placeholder="Title or author..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  {searchTerm && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSearchTerm('')}
                      className="w-full"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear search
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 4. Refresh */}
            <Card>
              <CardContent className="pt-6">
                <Button
                  onClick={handleRefresh}
                  disabled={isLoading || isRefreshing}
                  variant="secondary"
                  className="w-full gap-2"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh Latest Lists'}
                </Button>
              </CardContent>
            </Card>

            {/* 5. Compare - Comparison Week Selector */}
            {bestsellerData && comparisonWeekOptions.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <label className="text-sm font-medium block">
                      Compare current list to:
                    </label>
                    <Select value={comparisonWeek} onValueChange={handleComparisonWeekChange}>
                      <SelectTrigger
                        className="w-full"
                        aria-label="Select comparison week"
                      >
                        <SelectValue>
                          {(() => {
                            if (!comparisonWeek) return "Select a week...";
                            const selected = comparisonWeekOptions.find(opt => opt.value === comparisonWeek);
                            return selected?.displayText || "Select a week...";
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent position="popper" sideOffset={5}>
                        {comparisonWeekOptions.map((option) => {
                          const isSelected = comparisonWeek === option.value;

                          return (
                            <SelectItem key={option.value} value={option.value} className="cursor-pointer">
                              <div className="flex items-center justify-between w-full gap-3">
                                <span className={isSelected ? 'font-medium' : ''}>
                                  {option.displayText}
                                </span>
                                {isSelected && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            )}
          </aside>

          {/* Main Content */}
          <main aria-label="Bestseller lists">
        {bestsellerData ? (
          <div className="space-y-6">

            {/* Comparison Filter Badge */}
            {bestsellerData && comparisonWeek && (() => {
              // Get default comparison week (immediately previous week)
              const defaultWeek = new Date(bestsellerData.date);
              defaultWeek.setDate(defaultWeek.getDate() - 7);
              const defaultWeekValue = defaultWeek.toISOString().split('T')[0];

              // Only show badge if comparing to a week other than the default
              return comparisonWeek !== defaultWeekValue;
            })() && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      Comparing to Week Ending {new Date(comparisonWeek + 'T00:00:00').toLocaleDateString(undefined, {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const defaultWeek = new Date(bestsellerData.date);
                      defaultWeek.setDate(defaultWeek.getDate() - 7);
                      const defaultWeekValue = defaultWeek.toISOString().split('T')[0];
                      setComparisonWeek(defaultWeekValue);
                    }}
                    className="h-8 w-8 p-0"
                    aria-label="Reset comparison to previous week"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Categories */}
            <BookListDisplay
              bestsellerData={bestsellerData}
              filter={filter}
              audienceFilter={audienceFilter}
              searchTerm={searchTerm}
              bookAudiences={bookAudiences}
              isPbnStaff={isPbnStaff}
              onSwitchingDataClear={clearSwitchingData}
              onResetFilters={resetFilters}
            />
          </div>
        ) : loadError ? (
          <ErrorState
            title="Failed to load bestseller lists"
            description={loadError.message || 'Unknown error occurred'}
            onRetry={handleRefresh}
            autoFocus
          />
        ) : !isLoading ? (
          <EmptyState
            title="No data loaded"
            description="Click 'Refresh Latest Lists' to load the most recent PNBA bestseller data"
            icon={<Book />}
          />
        ) : null}

        {isLoading && (
          <LoadingState message="Loading bestseller lists..." />
        )}
        </main>
        </div>
      </div>
    </div>
  );
};

export default Index;
