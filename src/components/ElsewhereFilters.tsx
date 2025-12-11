/**
 * ElsewhereFilters Component
 *
 * Filter controls for Elsewhere discovery:
 * - Region selection (which regions to compare)
 * - Category filters
 * - Audience filters (A/T/C)
 * - Performance filters (min weeks, min regions)
 * - Sort options
 * - Search input
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ElsewhereFilters as ElsewhereFiltersType, SortOption } from '@/types/elsewhere';
import { REGIONS } from '@/config/regions';
import { X, Sparkles } from 'lucide-react';

interface ElsewhereFiltersProps {
  filters: ElsewhereFiltersType;
  onFiltersChange: (filters: ElsewhereFiltersType) => void;
}


export function ElsewhereFilters({ filters, onFiltersChange }: ElsewhereFiltersProps) {
  const availableRegions = REGIONS.filter(r => r.abbreviation !== filters.targetRegion && r.is_active);

  const updateFilters = (updates: Partial<ElsewhereFiltersType>) => {
    // Reset to page 1 when any filter changes (except page itself)
    if (!('page' in updates)) {
      updates.page = 1;
    }
    onFiltersChange({ ...filters, ...updates });
  };

  const handleRegionChange = (value: string) => {
    if (value === 'all') {
      updateFilters({ comparisonRegions: availableRegions.map(r => r.abbreviation) });
    } else {
      updateFilters({ comparisonRegions: [value] });
    }
  };

  // Get current selected region for dropdown
  const selectedRegion = filters.comparisonRegions.length === availableRegions.length
    ? 'all'
    : filters.comparisonRegions[0] || 'all';

  const resetFilters = () => {
    updateFilters({
      comparisonRegions: availableRegions.map(r => r.abbreviation),
      categories: undefined,
      minWeeksOnList: undefined,
      minRegions: undefined,
      search: undefined,
      showOnlyNewThisWeek: false,
    });
  };

  const hasActiveFilters =
    filters.comparisonRegions.length !== availableRegions.length ||
    filters.minWeeksOnList ||
    filters.minRegions ||
    filters.showOnlyNewThisWeek;

  return (
    <Card>
      {hasActiveFilters && (
        <CardHeader className="pb-4">
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="gap-1"
            >
              <X className="h-3 w-3" />
              Reset
            </Button>
          </div>
        </CardHeader>
      )}

      <CardContent className={hasActiveFilters ? "space-y-6" : "space-y-6 pt-6"}>
        {/* Compare Regions */}
        <div className="space-y-2">
          <Label htmlFor="region" className="text-sm font-medium">
            Compare Region
          </Label>
          <Select value={selectedRegion} onValueChange={handleRegionChange}>
            <SelectTrigger id="region">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {availableRegions.map((region) => (
                <SelectItem key={region.abbreviation} value={region.abbreviation}>
                  {region.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* New This Week Toggle */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Time Range</Label>
          <Button
            variant={filters.showOnlyNewThisWeek ? "default" : "outline"}
            size="sm"
            onClick={() => updateFilters({ showOnlyNewThisWeek: !filters.showOnlyNewThisWeek })}
            className="w-full gap-2"
          >
            <Sparkles className="h-4 w-4" />
            New This Week
            {filters.showOnlyNewThisWeek && <Badge variant="secondary" className="ml-auto">Active</Badge>}
          </Button>
        </div>

        {/* Minimum Weeks Filter */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Minimum Weeks on List</Label>
            <span className="text-sm text-muted-foreground">
              {filters.minWeeksOnList || 'Any'}
            </span>
          </div>
          <Slider
            value={[filters.minWeeksOnList || 0]}
            onValueChange={([value]) => updateFilters({ minWeeksOnList: value || undefined })}
            max={12}
            step={1}
            className="w-full"
          />
        </div>

        {/* Minimum Regions Filter */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Minimum Regions</Label>
            <span className="text-sm text-muted-foreground">
              {filters.minRegions || 'Any'}
            </span>
          </div>
          <Slider
            value={[filters.minRegions || 0]}
            onValueChange={([value]) => updateFilters({ minRegions: value || undefined })}
            max={7}
            step={1}
            className="w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
}
