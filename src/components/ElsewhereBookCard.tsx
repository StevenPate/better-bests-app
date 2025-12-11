/**
 * ElsewhereBookCard Component
 *
 * Displays a book card in the Elsewhere discovery grid showing:
 * - Cover image
 * - Title and author
 * - Regional badges (which regions it appears in)
 * - Performance metrics (best rank, weeks on list)
 * - Trend indicator
 */

import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ElsewhereBook } from '@/types/elsewhere';
import { TrendingUp, TrendingDown, Minus, Sparkles, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ElsewhereBookCardProps {
  book: ElsewhereBook;
  targetRegion: string;
}

/**
 * Get trend icon and color based on trend direction
 */
function getTrendDisplay(trend: ElsewhereBook['regionalPerformance'][0]['trend']) {
  switch (trend) {
    case 'rising':
      return { icon: TrendingUp, color: 'text-green-600', label: 'Rising' };
    case 'falling':
      return { icon: TrendingDown, color: 'text-red-600', label: 'Falling' };
    case 'new':
      return { icon: Sparkles, color: 'text-blue-600', label: 'New' };
    case 'stable':
    default:
      return { icon: Minus, color: 'text-gray-600', label: 'Stable' };
  }
}

/**
 * Format rank display (e.g., "#1", "#5")
 */
function formatRank(rank: number): string {
  return `#${rank}`;
}

export function ElsewhereBookCard({ book, targetRegion }: ElsewhereBookCardProps) {
  const { aggregateMetrics, regionalPerformance } = book;

  // Get the most common trend across regions
  const trendCounts = regionalPerformance.reduce((acc, perf) => {
    acc[perf.trend] = (acc[perf.trend] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const dominantTrend = Object.entries(trendCounts).sort((a, b) => b[1] - a[1])[0][0] as ElsewhereBook['regionalPerformance'][0]['trend'];
  const trendDisplay = getTrendDisplay(dominantTrend);
  const TrendIcon = trendDisplay.icon;

  return (
    <Card className="flex flex-col hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex gap-4">
          {/* Book Cover */}
          <div className="flex-shrink-0">
            {book.coverUrl ? (
              <img
                src={book.coverUrl}
                alt={`Cover of ${book.title}`}
                className="w-20 h-28 object-cover rounded border border-border"
              />
            ) : (
              <div className="w-20 h-28 bg-muted rounded border border-border flex items-center justify-center text-xs text-muted-foreground p-2 text-center">
                No cover
              </div>
            )}
          </div>

          {/* Title and Author */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base line-clamp-2 mb-1" title={book.title}>
              {book.title}
            </h3>
            <p className="text-sm text-muted-foreground line-clamp-1" title={book.author}>
              {book.author}
            </p>
            {book.category && (
              <Badge variant="outline" className="mt-2 text-xs">
                {book.category}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 pb-3">
        {/* Regional Badges */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Appears in {aggregateMetrics.totalRegions} {aggregateMetrics.totalRegions === 1 ? 'region' : 'regions'}:
          </p>
          <div className="flex flex-wrap gap-1">
            {regionalPerformance.slice(0, 6).map((perf) => (
              <TooltipProvider key={perf.region}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="text-xs cursor-help"
                    >
                      {perf.region}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1">
                      <p className="font-semibold">{perf.region}</p>
                      <p>Best rank: {formatRank(perf.bestRank)}</p>
                      <p>Weeks on list: {perf.weeksOnList}</p>
                      {perf.currentRank && (
                        <p>Current: {formatRank(perf.currentRank)}</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
            {regionalPerformance.length > 6 && (
              <Badge variant="secondary" className="text-xs">
                +{regionalPerformance.length - 6}
              </Badge>
            )}
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="bg-muted/50 rounded p-2">
            <p className="text-xs text-muted-foreground">Best Rank</p>
            <p className="font-semibold">{formatRank(aggregateMetrics.bestRankAchieved)}</p>
          </div>
          <div className="bg-muted/50 rounded p-2">
            <p className="text-xs text-muted-foreground">Total Weeks</p>
            <p className="font-semibold">{aggregateMetrics.totalWeeksAcrossAllRegions}</p>
          </div>
        </div>

        {/* Trend Indicator */}
        <div className="flex items-center gap-2 text-sm">
          <TrendIcon className={`h-4 w-4 ${trendDisplay.color}`} />
          <span className={`text-xs ${trendDisplay.color}`}>
            {trendDisplay.label}
          </span>
        </div>
      </CardContent>

      <CardFooter className="pt-3 border-t">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          asChild
        >
          <Link to={`/region/${targetRegion}/book/${book.isbn}`}>
            View Details
            <ExternalLink className="h-3 w-3" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
