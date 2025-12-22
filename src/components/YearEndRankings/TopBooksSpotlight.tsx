import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Award, Medal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { BookCoverImage } from '@/components/BookCoverImage';
import { fetchCachedBookInfo } from '@/services/googleBooksApi';
import type { BookRanking } from '@/types/performance';

interface TopBooksSpotlightProps {
  books: BookRanking[];
  title?: string;
  subtitle?: string;
}

async function fetchBookCovers(isbns: string[]): Promise<Map<string, string | null>> {
  const coverMap = new Map<string, string | null>();

  await Promise.all(
    isbns.map(async (isbn) => {
      try {
        // Use unified cache
        const bookInfo = await fetchCachedBookInfo(isbn);
        if (!bookInfo._notFound && bookInfo.imageLinks) {
          const { imageLinks } = bookInfo;
          coverMap.set(
            isbn,
            imageLinks.medium || imageLinks.small || imageLinks.thumbnail || null
          );
        } else {
          coverMap.set(isbn, null);
        }
      } catch {
        coverMap.set(isbn, null);
      }
    })
  );

  return coverMap;
}

function SpotlightCard({
  book,
  rank,
  coverUrl,
  variant,
}: {
  book: BookRanking;
  rank: number;
  coverUrl: string | null;
  variant: 'gold' | 'silver' | 'bronze';
}) {
  const variantStyles = {
    gold: {
      icon: Trophy,
      bg: 'bg-gradient-to-br from-yellow-500/20 via-amber-500/10 to-yellow-600/5',
      border: 'border-yellow-500/30',
      badge: 'bg-yellow-500 text-yellow-950',
      ring: 'ring-yellow-500/20',
    },
    silver: {
      icon: Award,
      bg: 'bg-gradient-to-br from-slate-400/20 via-gray-400/10 to-slate-500/5',
      border: 'border-slate-400/30',
      badge: 'bg-slate-400 text-slate-950',
      ring: 'ring-slate-400/20',
    },
    bronze: {
      icon: Medal,
      bg: 'bg-gradient-to-br from-orange-600/20 via-amber-700/10 to-orange-700/5',
      border: 'border-orange-600/30',
      badge: 'bg-orange-600 text-orange-950',
      ring: 'ring-orange-600/20',
    },
  };

  const style = variantStyles[variant];
  const Icon = style.icon;

  return (
    <div
      className={`relative rounded-xl ${style.bg} border ${style.border} p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg ring-1 ${style.ring}`}
    >
      {/* Rank badge */}
      <div className="absolute -top-3 -left-2">
        <Badge className={`${style.badge} font-bold text-sm px-3 py-1 shadow-md`}>
          <Icon className="w-4 h-4 mr-1" />#{rank}
        </Badge>
      </div>

      <div className="flex gap-4 mt-2">
        {/* Book cover */}
        <div className="flex-shrink-0">
          <BookCoverImage
            isbn={book.isbn}
            title={book.title}
            initialSrc={coverUrl}
            size="md"
          />
        </div>

        {/* Book info */}
        <div className="flex-1 min-w-0">
          <Link
            to={`/book/${book.isbn}`}
            className="font-semibold text-base md:text-lg hover:underline line-clamp-2 block"
          >
            {book.title}
          </Link>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
            {book.author}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs">
              Score: {book.score.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Badge>
            {book.metadata.weeksOnChart && (
              <Badge variant="outline" className="text-xs">
                {book.metadata.weeksOnChart} weeks
              </Badge>
            )}
            {book.metadata.rsi && (
              <Badge variant="outline" className="text-xs">
                {(book.metadata.rsi * 100).toFixed(0)}% regional
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TopBooksSpotlight({
  books,
  title = 'Top Performers',
  subtitle,
}: TopBooksSpotlightProps) {
  const [covers, setCovers] = useState<Map<string, string | null>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const topThree = books.slice(0, 3);

  useEffect(() => {
    if (topThree.length === 0) {
      setIsLoading(false);
      return;
    }

    const loadCovers = async () => {
      setIsLoading(true);
      const isbns = topThree.map((b) => b.isbn);
      const coverMap = await fetchBookCovers(isbns);
      setCovers(coverMap);
      setIsLoading(false);
    };

    loadCovers();
  }, [topThree.map((b) => b.isbn).join(',')]);

  if (topThree.length === 0) {
    return null;
  }

  const variants: Array<'gold' | 'silver' | 'bronze'> = ['gold', 'silver', 'bronze'];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl md:text-3xl font-bold">{title}</h2>
        {subtitle && (
          <p className="text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* On desktop, show in order: 2, 1, 3 for podium effect */}
        <div className="hidden md:block md:mt-8">
          {topThree[1] && (
            <SpotlightCard
              book={topThree[1]}
              rank={2}
              coverUrl={covers.get(topThree[1].isbn) || null}
              variant="silver"
            />
          )}
        </div>

        <div className="md:mt-0">
          {topThree[0] && (
            <SpotlightCard
              book={topThree[0]}
              rank={1}
              coverUrl={covers.get(topThree[0].isbn) || null}
              variant="gold"
            />
          )}
        </div>

        <div className="hidden md:block md:mt-8">
          {topThree[2] && (
            <SpotlightCard
              book={topThree[2]}
              rank={3}
              coverUrl={covers.get(topThree[2].isbn) || null}
              variant="bronze"
            />
          )}
        </div>

        {/* On mobile, show in order: 1, 2, 3 */}
        <div className="md:hidden">
          {topThree[1] && (
            <SpotlightCard
              book={topThree[1]}
              rank={2}
              coverUrl={covers.get(topThree[1].isbn) || null}
              variant="silver"
            />
          )}
        </div>
        <div className="md:hidden">
          {topThree[2] && (
            <SpotlightCard
              book={topThree[2]}
              rank={3}
              coverUrl={covers.get(topThree[2].isbn) || null}
              variant="bronze"
            />
          )}
        </div>
      </div>
    </div>
  );
}
