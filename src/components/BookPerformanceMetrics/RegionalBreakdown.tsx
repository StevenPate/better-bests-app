import { RegionalPerformance } from '@/types/performance';
import { Progress } from '@/components/ui/progress';

interface RegionalBreakdownProps {
  regionalData: RegionalPerformance[];
}

export function RegionalBreakdown({ regionalData }: RegionalBreakdownProps) {
  if (regionalData.length === 0) {
    return <p className="text-sm text-muted-foreground">No regional data available</p>;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Regional Breakdown</h4>
      {regionalData.map((region) => (
        <div key={region.region} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="font-medium">{region.region}:</span>
            <span className="text-muted-foreground">
              {region.regional_score.toFixed(1)} ({(region.regional_strength_index * 100).toFixed(1)}%)
            </span>
          </div>
          <Progress value={region.regional_strength_index * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">
            {region.weeks_on_chart} weeks • Best rank: #{region.best_rank}
          </p>
        </div>
      ))}
    </div>
  );
}
