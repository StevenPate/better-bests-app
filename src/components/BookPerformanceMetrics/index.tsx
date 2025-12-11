import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useBookPerformance } from '@/hooks/useBookPerformance';
import { useBookRegionalPerformance } from '@/hooks/useBookRegionalPerformance';
import { RegionalBreakdown } from './RegionalBreakdown';

interface BookPerformanceMetricsProps {
  isbn: string;
  year?: number;
}

export function BookPerformanceMetrics({ isbn, year = 2025 }: BookPerformanceMetricsProps) {
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useBookPerformance(isbn, year);
  const { data: regional, isLoading: regionalLoading } = useBookRegionalPerformance(isbn, year);

  if (metricsLoading || regionalLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{year} Performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (metricsError || !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{year} Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No performance data available for {year}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{year} Performance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Score</p>
            <p className="text-2xl font-bold">{metrics.total_score.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg Per Week</p>
            <p className="text-2xl font-bold">{metrics.avg_score_per_week.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Weeks on Chart</p>
            <p className="text-2xl font-bold">{metrics.weeks_on_chart}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Regions</p>
            <p className="text-2xl font-bold">{metrics.regions_appeared} of 8</p>
          </div>
        </div>

        {regional && regional.length > 0 && (
          <div className="pt-4 border-t">
            <RegionalBreakdown regionalData={regional} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
