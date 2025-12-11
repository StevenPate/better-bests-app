import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { BookCoverImage } from '@/components/BookCoverImage';
import { fetchCachedBookInfo } from '@/services/googleBooksApi';
import type { BookRanking } from '@/types/performance';

interface EnhancedRankingCardProps {
  ranking: BookRanking;
  rank: number;
  showRegion?: boolean;
}

export function EnhancedRankingCard({ ranking, rank, showRegion = false }: EnhancedRankingCardProps) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchCover = async () => {
      try {
        // Use unified cache
        const bookInfo = await fetchCachedBookInfo(ranking.isbn);
        if (!bookInfo._notFound && bookInfo.imageLinks) {
          const { imageLinks } = bookInfo;
          setCoverUrl(imageLinks.small || imageLinks.thumbnail || null);
        }
      } catch {
        // Silently fail - BookCoverImage will handle fallback
      }
    };

    fetchCover();
  }, [ranking.isbn]);

  const isTopThree = rank <= 3;
  const rankColors = {
    1: 'bg-yellow-500 text-yellow-950',
    2: 'bg-slate-400 text-slate-950',
    3: 'bg-orange-600 text-orange-950',
  };

  return (
    <div className="group flex gap-4 p-4 rounded-lg border border-border/50 bg-card hover:bg-accent/30 hover:border-border transition-all duration-200">
      {/* Rank */}
      <div className="flex-shrink-0 w-10">
        {isTopThree ? (
          <Badge className={`${rankColors[rank as 1 | 2 | 3]} font-bold w-8 h-8 flex items-center justify-center rounded-full p-0`}>
            {rank}
          </Badge>
        ) : (
          <span className="text-2xl font-bold text-muted-foreground/60 w-8 h-8 flex items-center justify-center">
            {rank}
          </span>
        )}
      </div>

      {/* Book cover */}
      <div className="flex-shrink-0">
        <BookCoverImage
          isbn={ranking.isbn}
          title={ranking.title}
          initialSrc={coverUrl}
          size="sm"
        />
      </div>

      {/* Book info */}
      <div className="flex-1 min-w-0">
        <Link
          to={`/book/${ranking.isbn}`}
          className="font-semibold hover:underline line-clamp-1 group-hover:text-primary transition-colors"
        >
          {ranking.title}
        </Link>
        <p className="text-sm text-muted-foreground line-clamp-1">{ranking.author}</p>

        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary" className="font-medium">
            {ranking.score.toLocaleString(undefined, { maximumFractionDigits: 0 })} pts
          </Badge>

          {ranking.metadata.weeksOnChart && (
            <span className="text-muted-foreground">
              {ranking.metadata.weeksOnChart} weeks
            </span>
          )}

          {showRegion && ranking.metadata.region && (
            <Badge variant="outline" className="text-xs">
              {ranking.metadata.region}
            </Badge>
          )}

          {ranking.metadata.rsi && (
            <span className="text-muted-foreground">
              {(ranking.metadata.rsi * 100).toFixed(0)}% regional
            </span>
          )}

          {ranking.metadata.rsiVariance !== undefined && (
            <span className="text-muted-foreground">
              Variance: {ranking.metadata.rsiVariance.toFixed(3)}
            </span>
          )}

          {ranking.metadata.regionsAppeared && (
            <span className="text-muted-foreground">
              {ranking.metadata.regionsAppeared} regions
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface RankingListProps {
  rankings: BookRanking[];
  startRank?: number;
  showRegion?: boolean;
}

export function RankingList({ rankings, startRank = 1, showRegion = false }: RankingListProps) {
  return (
    <div className="space-y-2">
      {rankings.map((ranking, index) => (
        <EnhancedRankingCard
          key={ranking.isbn}
          ranking={ranking}
          rank={startRank + index}
          showRegion={showRegion}
        />
      ))}
    </div>
  );
}
