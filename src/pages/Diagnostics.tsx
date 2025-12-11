import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { BestsellerParser } from '@/utils/bestsellerParser';
import { DateUtils } from '@/utils/dateUtils';
import { REGIONS } from '@/config/regions';
import { RefreshCw, Trash2, Database, Clock, Calendar, AlertCircle } from 'lucide-react';
import { logger } from '@/lib/logger';

interface CacheEntry {
  cache_key: string;
  last_fetched: string;
  data: any;
  id: number;
}

interface CacheStats {
  region: string;
  // Current week cache
  cacheKey: string;
  lastFetched: string | null;
  ageHours: number | null;
  ageDisplay: string;
  isStale: boolean;
  currentWeek: string;
  cachedDate: string | null;
  // Previous week cache
  previousWeek: string;
  previousCacheKey: string;
  previousLastFetched: string | null;
  previousAgeHours: number | null;
  previousAgeDisplay: string;
  previousIsStale: boolean;
  previousCachedDate: string | null;
}

/**
 * Check if a list date (Sunday) corresponds to a given Wednesday file date.
 * PNBA lists are dated for Sunday but published on Wednesday (3 days later).
 *
 * @param listDate - The Sunday list date (e.g., "Sunday, November 2, 2025")
 * @param wednesdayDate - The Wednesday file date (e.g., "2025-11-05")
 * @returns true if they represent the same week
 */
function isSameWeek(listDate: string | null, wednesdayDate: string): boolean {
  if (!listDate) return false;

  try {
    // Parse the Sunday list date
    const sunday = new Date(listDate);

    // Add 3 days to get to Wednesday
    const expectedWednesday = new Date(sunday);
    expectedWednesday.setDate(sunday.getDate() + 3);

    // Compare the Wednesday dates
    const expectedWed = expectedWednesday.toISOString().split('T')[0];
    return expectedWed === wednesdayDate;
  } catch {
    return false;
  }
}

/**
 * Diagnostics page for cache and data inspection
 *
 * Features:
 * - View cache status for all regions
 * - See last fetch times and cache age
 * - Force refresh cache for specific regions
 * - Clear all cache
 * - Staff-only access
 */
export default function Diagnostics() {
  const { user, isPbnStaff, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [cacheStats, setCacheStats] = useState<CacheStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState<string | null>(null);

  // Redirect non-staff users (wait for auth to load first)
  useEffect(() => {
    if (authLoading) return; // Don't redirect while auth is loading

    if (!user) {
      navigate('/auth');
    } else if (!isPbnStaff) {
      navigate('/');
      toast({
        title: 'Access Denied',
        description: 'This page is only accessible to PBN staff members.',
        variant: 'destructive',
      });
    }
  }, [user, isPbnStaff, authLoading, navigate, toast]);

  // Load cache stats on mount (only after auth completes)
  useEffect(() => {
    if (!authLoading && user && isPbnStaff) {
      loadCacheStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isPbnStaff]);

  const formatAge = (ageHours: number | null): string => {
    if (ageHours === null) return 'Never fetched';

    if (ageHours < 1) {
      return `${Math.round(ageHours * 60)} minutes ago`;
    } else if (ageHours < 24) {
      return `${Math.round(ageHours)} hours ago`;
    } else {
      const days = Math.round(ageHours / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
  };

  const loadCacheStats = async () => {
    setIsLoading(true);
    try {
      const stats: CacheStats[] = [];
      const now = new Date();
      const currentWeek = DateUtils.getMostRecentWednesday().toISOString().split('T')[0];
      const previousWeek = DateUtils.getPreviousWednesday().toISOString().split('T')[0];

      for (const region of REGIONS) {
        // Current week cache
        const cacheKey = `${region.abbreviation}_current_bestseller_list_v2`;
        const { data: currentData, error: currentError } = await supabase
          .from('fetch_cache')
          .select('*')
          .eq('cache_key', cacheKey)
          .maybeSingle();

        if (currentError) {
          logger.error('Error fetching current cache stats:', currentError);
        }

        const currentEntry = currentData as CacheEntry | null;
        let ageHours = null;
        let ageDisplay = 'Never fetched';
        let isStale = true;
        let cachedDate = null;

        if (currentEntry) {
          const lastFetchDate = new Date(currentEntry.last_fetched);
          ageHours = (now.getTime() - lastFetchDate.getTime()) / (1000 * 60 * 60);
          ageDisplay = formatAge(ageHours);
          isStale = ageHours > (7 * 24); // 7 days
          cachedDate = currentEntry.data?.current?.date || null;
        }

        // Previous week cache (comparison data)
        const previousCacheKey = `${region.abbreviation}_bestseller_list_vs_${previousWeek}_v2`;
        const { data: previousData, error: previousError } = await supabase
          .from('fetch_cache')
          .select('*')
          .eq('cache_key', previousCacheKey)
          .maybeSingle();

        if (previousError) {
          logger.error('Error fetching previous cache stats:', previousError);
        }

        const previousEntry = previousData as CacheEntry | null;
        let previousAgeHours = null;
        let previousAgeDisplay = 'Never fetched';
        let previousIsStale = true;
        let previousCachedDate = null;

        if (previousEntry) {
          const lastFetchDate = new Date(previousEntry.last_fetched);
          previousAgeHours = (now.getTime() - lastFetchDate.getTime()) / (1000 * 60 * 60);
          previousAgeDisplay = formatAge(previousAgeHours);
          previousIsStale = previousAgeHours > (7 * 24);
          // Use 'previous' field - comparison cache stores Oct 29 data in 'previous'
          previousCachedDate = previousEntry.data?.previous?.date || null;
        }

        stats.push({
          region: region.abbreviation,
          // Current week
          cacheKey,
          lastFetched: currentEntry?.last_fetched || null,
          ageHours,
          ageDisplay,
          isStale,
          currentWeek,
          cachedDate,
          // Previous week
          previousWeek,
          previousCacheKey,
          previousLastFetched: previousEntry?.last_fetched || null,
          previousAgeHours,
          previousAgeDisplay,
          previousIsStale,
          previousCachedDate,
        });
      }

      setCacheStats(stats);
    } catch (error) {
      logger.error('Failed to load cache stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load cache statistics.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshRegion = async (region: string) => {
    setIsRefreshing(region);
    try {
      logger.debug('Forcing refresh for region:', region);

      await BestsellerParser.fetchBestsellerData({
        region,
        refresh: true,
      });

      toast({
        title: 'Refresh Successful',
        description: `Fresh data fetched for ${region}`,
      });

      // Reload stats
      await loadCacheStats();
    } catch (error) {
      logger.error('Refresh failed:', error);
      toast({
        title: 'Refresh Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(null);
    }
  };

  const handleRefreshPreviousWeek = async (region: string) => {
    setIsRefreshing(`${region}-prev`);
    try {
      const previousWeek = DateUtils.getPreviousWednesday().toISOString().split('T')[0];
      logger.debug('Forcing refresh for previous week:', region, previousWeek);

      await BestsellerParser.fetchBestsellerData({
        region,
        comparisonWeek: previousWeek,
        refresh: true,
      });

      toast({
        title: 'Previous Week Refreshed',
        description: `Fresh data fetched for ${region} previous week (${previousWeek})`,
      });

      // Reload stats
      await loadCacheStats();
    } catch (error) {
      logger.error('Previous week refresh failed:', error);
      toast({
        title: 'Refresh Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(null);
    }
  };

  const handleRefreshComparison = async (region: string) => {
    setIsRefreshing(`${region}-comp`);
    try {
      logger.debug('Forcing full comparison refresh for region:', region);

      // First refresh current week
      await BestsellerParser.fetchBestsellerData({
        region,
        refresh: true,
      });

      // Then refresh previous week
      const previousWeek = DateUtils.getPreviousWednesday().toISOString().split('T')[0];
      await BestsellerParser.fetchBestsellerData({
        region,
        comparisonWeek: previousWeek,
        refresh: true,
      });

      toast({
        title: 'Comparison Refreshed',
        description: `Both current and previous week refreshed for ${region}`,
      });

      // Reload stats
      await loadCacheStats();
    } catch (error) {
      logger.error('Comparison refresh failed:', error);
      toast({
        title: 'Refresh Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(null);
    }
  };

  const handleClearCache = async (region?: string) => {
    try {
      if (region) {
        const currentCacheKey = `${region}_current_bestseller_list_v2`;
        const previousWeek = DateUtils.getPreviousWednesday().toISOString().split('T')[0];
        const previousCacheKey = `${region}_bestseller_list_vs_${previousWeek}_v2`;

        await supabase.from('fetch_cache').delete().in('cache_key', [currentCacheKey, previousCacheKey]);

        toast({
          title: 'Cache Cleared',
          description: `Cache cleared for ${region} (current and previous week)`,
        });
      } else {
        // Clear all region caches (current and previous weeks)
        const keys = REGIONS.flatMap(r => {
          const previousWeek = DateUtils.getPreviousWednesday().toISOString().split('T')[0];
          return [
            `${r.abbreviation}_current_bestseller_list_v2`,
            `${r.abbreviation}_bestseller_list_vs_${previousWeek}_v2`
          ];
        });
        await supabase.from('fetch_cache').delete().in('cache_key', keys);

        toast({
          title: 'All Cache Cleared',
          description: 'Cache cleared for all regions (current and previous weeks)',
        });
      }

      // Reload stats
      await loadCacheStats();
    } catch (error) {
      logger.error('Clear cache failed:', error);
      toast({
        title: 'Clear Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  // Show loading state while auth is loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8 flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-muted-foreground">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if redirecting
  if (!user || !isPbnStaff) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cache Diagnostics</h1>
            <p className="text-muted-foreground mt-1">
              Monitor and manage bestseller data cache across all regions
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to Lists
          </Button>
        </div>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Cache Management
            </CardTitle>
            <CardDescription>
              Force refresh data or clear cache to resolve stale data issues
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button onClick={() => loadCacheStats()} variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Reload Stats
            </Button>
            <Button
              onClick={() => handleClearCache()}
              variant="destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Cache
            </Button>
          </CardContent>
        </Card>

        {/* Current Time Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Current Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Today</div>
                <div className="font-medium">
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Most Recent Wednesday</div>
                <div className="font-medium">
                  {DateUtils.getMostRecentWednesday().toISOString().split('T')[0]}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Previous Wednesday</div>
                <div className="font-medium">
                  {DateUtils.getPreviousWednesday().toISOString().split('T')[0]}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Day of Week</div>
                <div className="font-medium">
                  {new Date().getDay() === 3 ? (
                    <Badge variant="default">Wednesday (Fetch Day)</Badge>
                  ) : (
                    <span>Day {new Date().getDay()}</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cache Stats Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Regional Cache Status
            </CardTitle>
            <CardDescription>
              Cache age and freshness for each regional bestseller list
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading cache statistics...
              </div>
            ) : (
              <div className="space-y-4">
                {cacheStats.map((stat) => (
                  <div
                    key={stat.region}
                    className="border rounded-lg overflow-hidden"
                  >
                    {/* Region Header */}
                    <div className="bg-muted/50 px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{stat.region}</span>
                        {(stat.isStale || stat.previousIsStale) && (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Stale Data
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleRefreshComparison(stat.region)}
                          disabled={isRefreshing === `${stat.region}-comp`}
                          size="sm"
                          variant="default"
                        >
                          {isRefreshing === `${stat.region}-comp` ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Refreshing Both...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Refresh Comparison
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleClearCache(stat.region)}
                          disabled={!stat.lastFetched && !stat.previousLastFetched}
                          size="sm"
                          variant="ghost"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Current Week Row */}
                    <div className="p-4 border-b">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">Current Week ({stat.currentWeek})</span>
                            {stat.isStale && (
                              <Badge variant="destructive">Stale</Badge>
                            )}
                            {!stat.lastFetched && (
                              <Badge variant="secondary">Never Fetched</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Last fetched: <span className="font-medium">{stat.ageDisplay}</span>
                            {stat.cachedDate && (
                              <>
                                {' • '}
                                Cached date: <span className="font-medium">{stat.cachedDate}</span>
                              </>
                            )}
                          </div>
                          {!isSameWeek(stat.cachedDate, stat.currentWeek) && stat.cachedDate && (
                            <div className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Cached date doesn't match current week
                            </div>
                          )}
                        </div>
                        <Button
                          onClick={() => handleRefreshRegion(stat.region)}
                          disabled={isRefreshing === stat.region}
                          size="sm"
                          variant="outline"
                        >
                          {isRefreshing === stat.region ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Refreshing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Refresh Current
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Previous Week Row */}
                    <div className="p-4 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">Previous Week ({stat.previousWeek})</span>
                            {stat.previousIsStale && (
                              <Badge variant="destructive">Stale</Badge>
                            )}
                            {!stat.previousLastFetched && (
                              <Badge variant="secondary">Never Fetched</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Last fetched: <span className="font-medium">{stat.previousAgeDisplay}</span>
                            {stat.previousCachedDate && (
                              <>
                                {' • '}
                                Cached date: <span className="font-medium">{stat.previousCachedDate}</span>
                              </>
                            )}
                          </div>
                          {!isSameWeek(stat.previousCachedDate, stat.previousWeek) && stat.previousCachedDate && (
                            <div className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              Cached date doesn't match previous week
                            </div>
                          )}
                        </div>
                        <Button
                          onClick={() => handleRefreshPreviousWeek(stat.region)}
                          disabled={isRefreshing === `${stat.region}-prev`}
                          size="sm"
                          variant="outline"
                        >
                          {isRefreshing === `${stat.region}-prev` ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                              Refreshing...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Refresh Previous
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Help Text */}
        <Card>
          <CardHeader>
            <CardTitle>How to Fix Stale Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <strong className="font-medium">Symptoms:</strong>
              <p className="text-muted-foreground">
                Books showing as "NEW" when they were on last week's list, or incorrect weeks-on-list counts.
              </p>
            </div>
            <div>
              <strong className="font-medium">Understanding the Cache:</strong>
              <p className="text-muted-foreground">
                Each region has TWO cache entries: <strong>Current Week</strong> and <strong>Previous Week</strong>. The comparison logic uses both to determine what's new, what dropped, and rank changes.
              </p>
            </div>
            <div>
              <strong className="font-medium">Best Fix (Recommended):</strong>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
                <li>Click "Refresh Comparison" for the affected region</li>
                <li>This refreshes BOTH current and previous week data</li>
                <li>Wait 20-30 seconds for both fetches to complete</li>
                <li>Reload the main app page</li>
              </ol>
            </div>
            <div>
              <strong className="font-medium">Targeted Fix:</strong>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
                <li>Check which week is stale (Current or Previous)</li>
                <li>Click "Refresh Current" or "Refresh Previous" accordingly</li>
                <li>If both are stale, use "Refresh Comparison" instead</li>
              </ol>
            </div>
            <div>
              <strong className="font-medium">Nuclear Option:</strong>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
                <li>Click "Clear All Cache" above</li>
                <li>Click "Refresh Comparison" for each region</li>
                <li>Wait for all regions to complete</li>
                <li>Reload the main app page</li>
              </ol>
            </div>
            <div>
              <strong className="font-medium">Auto-Refresh Schedule:</strong>
              <p className="text-muted-foreground">
                Cache automatically refreshes on Wednesdays or when cache is &gt;7 days old.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
