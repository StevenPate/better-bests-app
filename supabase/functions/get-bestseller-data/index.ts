/**
 * Supabase Edge Function: get-bestseller-data
 *
 * Purpose: Read-only API for frontend to fetch bestseller lists
 *
 * Features:
 * - Returns current and comparison week data
 * - Includes metadata for data freshness indicators
 * - Caching headers for performance
 * - Public access (data is not sensitive)
 *
 * Security: Read-only, no writes. Data already in database from backend job.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

// ============================================================================
// CORS Headers
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the most recent Wednesday date
 */
function getMostRecentWednesday(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysToSubtract = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4;
  const wednesday = new Date(now);
  wednesday.setDate(now.getDate() - daysToSubtract);
  wednesday.setHours(0, 0, 0, 0);
  return wednesday;
}

/**
 * Calculate ETag from week dates
 */
function calculateETag(currentWeek: string, comparisonWeek: string): string {
  return `"${currentWeek}-${comparisonWeek}"`;
}

/**
 * Determine cache status based on metadata
 */
function getCacheStatus(lastFetched: string): 'fresh' | 'stale' | 'unavailable' {
  if (!lastFetched) return 'unavailable';

  const fetchedDate = new Date(lastFetched);
  const now = new Date();
  const hoursSinceFetch = (now.getTime() - fetchedDate.getTime()) / (1000 * 60 * 60);

  // Fresh if less than 4 hours old
  if (hoursSinceFetch < 4) return 'fresh';

  // Stale if 4-24 hours old
  if (hoursSinceFetch < 24) return 'stale';

  // Unavailable if more than 24 hours old
  return 'unavailable';
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client (using anon key for read-only access)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    // Parse query parameters
    const url = new URL(req.url);
    const weekParam = url.searchParams.get('week') || 'current';
    const compareParam = url.searchParams.get('compare');

    // Determine weeks to fetch
    let currentWeek: Date;
    let comparisonWeek: Date;

    if (weekParam === 'current') {
      currentWeek = getMostRecentWednesday();
      comparisonWeek = new Date(currentWeek);
      comparisonWeek.setDate(currentWeek.getDate() - 7);
    } else {
      // Custom week provided (format: YYYY-MM-DD)
      currentWeek = new Date(weekParam);
      if (compareParam) {
        comparisonWeek = new Date(compareParam);
      } else {
        comparisonWeek = new Date(currentWeek);
        comparisonWeek.setDate(currentWeek.getDate() - 7);
      }
    }

    const currentWeekStr = currentWeek.toISOString().split('T')[0];
    const comparisonWeekStr = comparisonWeek.toISOString().split('T')[0];

    // Check If-None-Match header for caching
    const ifNoneMatch = req.headers.get('If-None-Match');
    const etag = calculateETag(currentWeekStr, comparisonWeekStr);

    if (ifNoneMatch === etag) {
      return new Response(null, {
        status: 304, // Not Modified
        headers: corsHeaders,
      });
    }

    // Fetch from cache (written by backend job)
    const cacheKey = compareParam ? `bestseller_list_vs_${comparisonWeekStr}` : 'current_bestseller_list';

    const { data: cachedData, error: cacheError } = await supabase
      .from('fetch_cache')
      .select('data, last_fetched')
      .eq('cache_key', cacheKey)
      .single();

    if (cacheError || !cachedData) {
      console.error('Cache miss or error:', cacheError);

      return new Response(
        JSON.stringify({
          error: 'Data not available',
          message: 'Bestseller data has not been fetched yet. Please try again later.',
          cacheKey,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Fetch metadata for freshness indicators
    const { data: metadata } = await supabase
      .from('bestseller_list_metadata')
      .select('*')
      .eq('week_date', currentWeekStr)
      .single();

    // Calculate next refresh time (next Wednesday 9:00 AM PT)
    const nextWednesday = new Date(currentWeek);
    nextWednesday.setDate(currentWeek.getDate() + 7);
    nextWednesday.setHours(16, 0, 0, 0); // 9 AM PT = 16:00 UTC (PDT)

    // Build response
    const response = {
      data: cachedData.data,
      metadata: {
        currentWeek: currentWeekStr,
        comparisonWeek: comparisonWeekStr,
        lastFetched: cachedData.last_fetched,
        nextRefresh: nextWednesday.toISOString(),
        cacheStatus: getCacheStatus(cachedData.last_fetched),
        bookCount: metadata?.book_count,
        categoryCount: metadata?.category_count,
        sourceUrl: metadata?.source_url,
        isCurrentWeek: metadata?.is_current_week || false,
      },
    };

    // Return with caching headers
    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
          'ETag': etag,
          'Last-Modified': new Date(cachedData.last_fetched).toUTCString(),
        },
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: (error as Error).message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
