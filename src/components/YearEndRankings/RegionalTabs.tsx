import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useYearEndRankings } from '@/hooks/useYearEndRankings';
import { RankingCard } from './RankingCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { BookRanking } from '@/types/performance';

const REGIONS = [
  { code: 'PNBA', name: 'Pacific NW' },
  { code: 'CALIBAN', name: 'NorCal' },
  { code: 'CALIBAS', name: 'SoCal' },
  { code: 'GLIBA', name: 'Great Lakes' },
  { code: 'MPIBA', name: 'Mountains & Plains' },
  { code: 'MIBA', name: 'Midwest' },
  { code: 'NAIBA', name: 'New Atlantic' },
  { code: 'NEIBA', name: 'New England' },
  { code: 'SIBA', name: 'Southern' },
];

interface RegionalTabsProps {
  year?: number;
  category?: 'regional_top10s' | 'most_regional';
  customData?: Record<string, BookRanking[]>;
}

export function RegionalTabs({ year = 2025, category = 'regional_top10s', customData }: RegionalTabsProps) {
  const [activeRegion, setActiveRegion] = useState('PNBA');
  const { data: rankings, isLoading } = useYearEndRankings(
    category,
    year,
    category === 'regional_top10s' ? activeRegion : undefined
  );

  // Use custom data if provided, otherwise use fetched rankings
  const getRegionalData = (regionCode: string) => {
    if (customData) {
      return customData[regionCode] || [];
    }
    return category === 'regional_top10s' && activeRegion === regionCode ? rankings : [];
  };

  const showLoading = !customData && isLoading;

  return (
    <Tabs value={activeRegion} onValueChange={setActiveRegion}>
      <TabsList className="grid w-full grid-cols-3 lg:grid-cols-9">
        {REGIONS.map((region) => (
          <TabsTrigger key={region.code} value={region.code}>
            {region.code}
          </TabsTrigger>
        ))}
      </TabsList>

      {REGIONS.map((region) => {
        const regionalData = getRegionalData(region.code);
        const shouldShow = customData || activeRegion === region.code;

        return (
          <TabsContent key={region.code} value={region.code} className="space-y-4">
            <h3 className="text-lg font-semibold">{region.name} Top 10</h3>
            {shouldShow && showLoading ? (
              <>
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </>
            ) : regionalData.length > 0 ? (
              regionalData.map((ranking, index) => (
                <RankingCard key={ranking.isbn} ranking={ranking} rank={index + 1} />
              ))
            ) : (
              <p className="text-muted-foreground text-center py-8">No data for this region</p>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
