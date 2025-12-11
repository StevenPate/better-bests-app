import { Link } from 'react-router-dom';
import { BookRanking } from '@/types/performance';
import { Card, CardContent } from '@/components/ui/card';

interface RankingCardProps {
  ranking: BookRanking;
  rank: number;
}

export function RankingCard({ ranking, rank }: RankingCardProps) {
  return (
    <Card className="hover:bg-accent/50 transition-colors">
      <CardContent className="pt-6">
        <div className="flex gap-4">
          <div className="text-2xl font-bold text-muted-foreground w-8">
            {rank}
          </div>
          <div className="flex-1">
            <Link
              to={`/book/${ranking.isbn}`}
              className="font-semibold hover:underline"
            >
              {ranking.title}
            </Link>
            <p className="text-sm text-muted-foreground">{ranking.author}</p>
            <div className="mt-2 flex gap-4 text-sm">
              <span className="font-medium">
                Score: {ranking.score.toFixed(1)}
              </span>
              {ranking.metadata.weeksOnChart && (
                <span className="text-muted-foreground">
                  {ranking.metadata.weeksOnChart} weeks
                </span>
              )}
              {ranking.metadata.rsi && (
                <span className="text-muted-foreground">
                  {(ranking.metadata.rsi * 100).toFixed(1)}% from {ranking.metadata.region}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
