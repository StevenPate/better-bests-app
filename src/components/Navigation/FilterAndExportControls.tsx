/**
 * FilterAndExportControls Component
 *
 * All filter and export controls consolidated into navigation.
 * Used in both desktop dropdown menu and mobile drawer.
 * Self-contained with its own data fetching via hooks.
 */

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExportActions } from '@/components/ExportActions';
import { useAuth } from '@/hooks/useAuth';
import { useRegion } from '@/hooks/useRegion';
import { useBestsellerData } from '@/hooks/useBestsellerData';
import { useBookAudiences } from '@/hooks/useBookAudiences';
import { useToast } from '@/hooks/use-toast';

export function FilterAndExportControls() {
  const { isPbnStaff } = useAuth();
  const { currentRegion } = useRegion();
  const { data: bestsellerData, isLoading, refresh } = useBestsellerData();
  const { audiences: bookAudiences } = useBookAudiences(bestsellerData);
  const { toast } = useToast();
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

  return (
    <div className="space-y-4">
      {/* Refresh Button */}
      <div>
        <Button
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
          variant="secondary"
          className="w-full gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Latest Lists'}
        </Button>
      </div>

      {/* Export Actions (Staff Only) */}
      {bestsellerData && isPbnStaff && (
        <div className="pt-2 border-t space-y-2">
          <label className="text-sm font-medium text-muted-foreground block">Export</label>
          <ExportActions
            region={currentRegion.abbreviation}
            bestsellerData={bestsellerData}
            bookAudiences={bookAudiences}
            isPbnStaff={isPbnStaff}
          />
        </div>
      )}
    </div>
  );
}
