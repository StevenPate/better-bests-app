import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Book, Calendar, ExternalLink, Users, Copy } from "lucide-react";
import { BookCoverImage } from "@/components/BookCoverImage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BestsellerParser } from "@/utils/bestsellerParser";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useRegion } from "@/hooks/useRegion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { logger } from '@/lib/logger';
import { RegionalHeatMap } from '@/components/BookChart';
import { BookPerformanceMetrics } from '@/components/BookPerformanceMetrics';
import { fetchCachedBookInfo, type CachedBookInfo } from '@/services/googleBooksApi';

interface BookCover {
  thumbnail?: string;
  small?: string;
  medium?: string;
  large?: string;
}

interface BookInfo {
  title: string;
  author: string;
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories?: string[];
  imageLinks?: BookCover;
  industryIdentifiers?: Array<{
    type: string;
    identifier: string;
  }>;
}

interface PositionHistory {
  date: string;
  position: number;
  category: string;
  isNew?: boolean;
  wasDropped?: boolean;
}

interface CurrentPosition {
  rank: number;
  category: string;
  listTitle: string;
}

const BookDetail = () => {
  const { isbn } = useParams<{ isbn: string }>();
  const [bookInfo, setBookInfo] = useState<BookInfo | null>(null);
  const [positionHistory, setPositionHistory] = useState<PositionHistory[]>([]);
  const [currentPosition, setCurrentPosition] = useState<CurrentPosition | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookAudience, setBookAudience] = useState<string>('');
  const { isPbnStaff } = useAuth();
  const { toast } = useToast();
  const { currentRegion } = useRegion();

  const fetchBookCover = async (isbn: string): Promise<BookInfo | null> => {
    try {
      // Use cached Google Books data (three-tier cache: memory -> Supabase -> API)
      const cachedInfo = await fetchCachedBookInfo(isbn);

      if (!cachedInfo._notFound && cachedInfo.title) {
        return {
          title: cachedInfo.title || 'Unknown Title',
          author: cachedInfo.authors?.join(', ') || 'Unknown Author',
          publisher: cachedInfo.publisher,
          publishedDate: cachedInfo.publishedDate,
          description: cachedInfo.description,
          pageCount: cachedInfo.pageCount,
          categories: cachedInfo.categories,
          imageLinks: cachedInfo.imageLinks,
          industryIdentifiers: cachedInfo.industryIdentifiers
        };
      }

      // Fallback: Try our database (distinct_books view)
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: dbBook, error: dbError } = await supabase
        .from('distinct_books')
        .select('title, author, publisher')
        .eq('isbn', isbn)
        .single();

      if (!dbError && dbBook) {
        return {
          title: dbBook.title || 'Unknown Title',
          author: dbBook.author || 'Unknown Author',
          publisher: dbBook.publisher,
        };
      }

      return null;
    } catch (error) {
      logger.error('Error fetching book cover:', error);
      return null;
    }
  };

  const fetchPositionHistory = async (isbn: string): Promise<PositionHistory[]> => {
    try {
      const history = await BestsellerParser.getBookHistory(isbn);
      return history || [];
    } catch (error) {
      logger.error('Error fetching position history:', error);
      return [];
    }
  };

  const fetchCurrentPosition = async (isbn: string): Promise<CurrentPosition | null> => {
    try {
      const parser = new BestsellerParser();
      const currentWeek = new Date();
      // Get the most recent Wednesday
      const daysSinceWednesday = (currentWeek.getDay() + 4) % 7;
      currentWeek.setDate(currentWeek.getDate() - daysSinceWednesday);
      
      const weekDate = currentWeek.toISOString().split('T')[0];
      
      // Query the database for current week's position
      const { supabase } = await import('@/integrations/supabase/client');
      
      const { data, error } = await supabase
        .from('book_positions')
        .select('rank, category, list_title')
        .eq('isbn', isbn.replace(/[-\s]/g, ''))
        .eq('week_date', weekDate)
        .single();
        
      if (error || !data) {
        return null;
      }
      
      return {
        rank: data.rank,
        category: data.category,
        listTitle: data.list_title || 'Bestseller'
      };
    } catch (error) {
      logger.error('Error fetching current position:', error);
      return null;
    }
  };

  const fetchBookAudience = async (isbn: string): Promise<string> => {
    try {
      const audience = await BestsellerParser.getBookAudience(isbn, currentRegion.abbreviation);
      return audience || '';
    } catch (error) {
      logger.error('Error fetching book audience:', error);
      return '';
    }
  };

  const handleAudienceChange = async (audience: string) => {
    if (!isbn) return;

    setBookAudience(audience);

    try {
      await BestsellerParser.updateBookAudience(isbn, audience, currentRegion.abbreviation);
      toast({
        title: "Updated",
        description: `Audience set to ${audience === 'A' ? 'Adult' : audience === 'T' ? 'Teen' : 'Children'} for ${currentRegion.abbreviation}`,
      });
    } catch (error) {
      logger.error('Error updating audience:', error);
      toast({
        title: "Error",
        description: "Failed to update audience. Please try again.",
        variant: "destructive",
      });
      // Revert the local state change
      setBookAudience('');
    }
  };

  useEffect(() => {
    if (!isbn) {
      setError('No ISBN provided');
      setIsLoading(false);
      return;
    }

    const loadBookData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [bookData, historyData, currentPos, audience] = await Promise.all([
          fetchBookCover(isbn),
          fetchPositionHistory(isbn),
          fetchCurrentPosition(isbn),
          fetchBookAudience(isbn)
        ]);

        setBookInfo(bookData);
        setPositionHistory(historyData);
        setCurrentPosition(currentPos);
        setBookAudience(audience);
      } catch (err) {
        setError('Failed to load book data');
        logger.error('Error loading book data:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadBookData();
  }, [isbn]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="animate-pulse space-y-8">
            <div className="h-8 bg-muted rounded w-32"></div>
            <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-16">
              <div className="h-96 bg-muted rounded"></div>
              <div className="space-y-6">
                <div className="h-12 bg-muted rounded w-3/4"></div>
                <div className="h-6 bg-muted rounded w-1/2"></div>
                <div className="h-32 bg-muted rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Lists
          </Link>
          <div className="bg-card border border-border rounded-lg p-12">
            <div className="text-center space-y-4">
              <Book className="w-12 h-12 text-muted-foreground mx-auto" />
              <h2 className="text-2xl font-semibold">Book Not Found</h2>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const coverImage = bookInfo?.imageLinks?.large || 
                    bookInfo?.imageLinks?.medium || 
                    bookInfo?.imageLinks?.small || 
                    bookInfo?.imageLinks?.thumbnail;

  const chartData = positionHistory
    .map(item => ({
      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      position: item.position,
      category: item.category
    }))
    .reverse(); // Show oldest to newest

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-8 pb-16">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm my-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Lists
        </Link>

        <main aria-label="Book details" className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-16 mt-8">
          {/* Left Sidebar - Sticky */}
          <aside className="lg:sticky lg:top-8 h-fit">
            {isbn && (
              <div className="mb-8">
                <BookCoverImage
                  isbn={isbn}
                  title={bookInfo?.title}
                  initialSrc={coverImage}
                  size="lg"
                  className="w-full rounded-lg shadow-2xl"
                />
              </div>
            )}

            <h1 className="text-3xl font-semibold leading-tight mb-3">
              {bookInfo?.title || 'Unknown Title'}
            </h1>
            <p className="text-lg text-muted-foreground mb-8">{bookInfo?.author || 'Unknown Author'}</p>

            {/* Publication Info */}
            {(bookInfo?.publisher || bookInfo?.publishedDate || bookInfo?.pageCount) && (
              <div className="py-6 border-t border-border">
                {bookInfo?.publisher && (
                  <div className="flex justify-between items-baseline mb-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Publisher</span>
                    <span className="text-sm">{bookInfo.publisher}</span>
                  </div>
                )}
                {bookInfo?.publishedDate && (
                  <div className="flex justify-between items-baseline mb-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Published</span>
                    <span className="text-sm">
                      {new Date(bookInfo.publishedDate).getFullYear()}
                    </span>
                  </div>
                )}
                {bookInfo?.pageCount && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Pages</span>
                    <span className="text-sm">{bookInfo.pageCount}</span>
                  </div>
                )}
              </div>
            )}

            {/* Category and Audience */}
            {(bookInfo?.categories || currentPosition || bookAudience) && (
              <div className="py-6 border-t border-border">
                {bookInfo?.categories && bookInfo.categories.length > 0 && (
                  <div className="flex justify-between items-baseline mb-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Category</span>
                    <Badge variant="secondary">{bookInfo.categories[0]}</Badge>
                  </div>
                )}
                {currentPosition && (
                  <div className="flex justify-between items-baseline mb-3">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Current Rank</span>
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      #{currentPosition.rank} {currentPosition.category}
                    </Badge>
                  </div>
                )}
                {isPbnStaff && isbn && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Audience</span>
                    <Select value={bookAudience} onValueChange={handleAudienceChange}>
                      <SelectTrigger className="h-8 text-sm w-32">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">Adult</SelectItem>
                        <SelectItem value="T">Teen</SelectItem>
                        <SelectItem value="C">Children</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* ISBN */}
            {isbn && (
              <div className="py-6 border-t border-b border-border">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">ISBN</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{isbn}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(isbn || '');
                          toast({
                            title: "Copied!",
                            description: `ISBN ${isbn} copied to clipboard`,
                          });
                        } catch {
                          toast({
                            title: "Copy failed",
                            description: "Unable to copy to clipboard",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* External Links */}
            <div className="mt-8 flex flex-col gap-3">
              <a
                href={`https://portbooknews.com/book/${isbn}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between px-4 py-3.5 bg-card border border-border rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-all text-sm group"
              >
                <span>Port Book News</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
              </a>
              <a
                href={`https://bookshop.org/a/5733/${isbn}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between px-4 py-3.5 bg-card border border-border rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-all text-sm group"
              >
                <span>Bookshop.org</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
              </a>
              <a
                href={`https://books.google.com/books?q=isbn:${isbn}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-between px-4 py-3.5 bg-card border border-border rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-all text-sm group"
              >
                <span>Google Books</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
              </a>
            </div>
          </aside>

          {/* Main Content */}
          <div className="pt-2 space-y-14">
            {/* Description */}
            {bookInfo?.description && (
              <section>
                <h2 className="text-2xl font-semibold mb-5">Description</h2>
                <p className="text-lg leading-relaxed text-muted-foreground max-w-[75ch]">
                  {bookInfo.description}
                </p>
              </section>
            )}

            {/* Performance Metrics */}
            <BookPerformanceMetrics isbn={isbn} year={2025} />

            {/* Regional Performance Heat Map */}
            <RegionalHeatMap isbn={isbn} />
          </div>
        </main>
      </div>
    </div>
  );
};

export default BookDetail;