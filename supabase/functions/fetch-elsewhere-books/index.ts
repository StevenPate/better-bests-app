/**
 * Fetch Elsewhere Books Edge Function
 *
 * Server-side endpoint for Elsewhere discovery feature. Queries regional_bestsellers
 * table to find books appearing in other regions but never in the target region.
 *
 * BENEFITS OF SERVER-SIDE APPROACH:
 * - Reduced client bandwidth (returns only filtered results)
 * - Better query performance (server-side optimization)
 * - Business logic not exposed to client
 * - Single rate limit point (vs multiple client queries)
 * - Easier to optimize and cache server-side
 *
 * AUTHENTICATION:
 * - Invoked with ANON key (public access)
 * - Internally uses SERVICE_ROLE_KEY for database queries
 * - RLS policies control data access
 *
 * Usage:
 *   POST /functions/v1/fetch-elsewhere-books
 *   Authorization: Bearer <ANON_KEY>
 *   Content-Type: application/json
 *   Body: { targetRegion, comparisonRegions, sortBy, ... }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface ElsewhereFilters {
  targetRegion: string;
  comparisonRegions: string[];
  sortBy: 'most_regions' | 'best_rank' | 'total_weeks' | 'newest';
  audiences?: string[];
  minWeeksOnList?: number;
  minRegions?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

interface RegionalPerformance {
  region: string;
  currentRank: number | null;
  weeksOnList: number;
  bestRank: number;
  trend: 'rising' | 'stable' | 'falling' | 'new';
  category?: string;
}

interface AggregateMetrics {
  totalRegions: number;
  totalWeeksAcrossAllRegions: number;
  bestRankAchieved: number;
  averageRank: number;
}

interface ElsewhereBook {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  category?: string;
  regionalPerformance: RegionalPerformance[];
  aggregateMetrics: AggregateMetrics;
}

interface ElsewhereDataResponse {
  books: ElsewhereBook[];
  totalCount: number;
  availableRegions: string[];
  weekDate: string;
  lastUpdated: string;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Calculate trend based on current and historical rank data
 */
function calculateTrend(
  currentRank: number | null,
  bestRank: number,
  weeksOnList: number
): 'rising' | 'stable' | 'falling' | 'new' {
  if (weeksOnList <= 2) return 'new';
  if (!currentRank) return 'falling';

  // Simple heuristic: if current rank is within 2 of best, consider rising
  if (currentRank - bestRank <= 2) return 'rising';
  if (currentRank - bestRank > 5) return 'falling';
  return 'stable';
}

/**
 * Fetch elsewhere books with server-side filtering and aggregation
 */
async function fetchElsewhereBooks(
  supabase: any,
  filters: ElsewhereFilters
): Promise<ElsewhereDataResponse> {
  const startTime = Date.now();
  console.log('Fetching elsewhere books with filters:', {
    targetRegion: filters.targetRegion,
    comparisonRegions: filters.comparisonRegions,
    sortBy: filters.sortBy,
  });

  try {
    const PAGE_SIZE = 1000;

    // Step 1: Get all ISBNs from target region (books we want to EXCLUDE)
    const targetIsbns = new Set<string>();
    let targetPage = 0;
    let hasMoreTarget = true;

    while (hasMoreTarget) {
      const { data: targetBooks, error: targetError } = await supabase
        .from('regional_bestsellers')
        .select('isbn')
        .eq('region', filters.targetRegion)
        .range(targetPage * PAGE_SIZE, (targetPage + 1) * PAGE_SIZE - 1);

      if (targetError) {
        console.error('Error fetching target region ISBNs:', targetError);
        throw targetError;
      }

      if (!targetBooks || targetBooks.length === 0) {
        hasMoreTarget = false;
      } else {
        targetBooks.forEach((b: any) => targetIsbns.add(b.isbn));
        hasMoreTarget = targetBooks.length === PAGE_SIZE;
        targetPage++;
      }
    }

    console.log(`Found ${targetIsbns.size} unique ISBNs in target region ${filters.targetRegion} from regional_bestsellers (${targetPage} pages)`);

    // Step 1b: For PNBA, also check legacy book_positions table to catch historical data
    if (filters.targetRegion === 'PNBA') {
      let legacyPage = 0;
      let hasMoreLegacy = true;

      while (hasMoreLegacy) {
        const { data: legacyBooks, error: legacyError } = await supabase
          .from('book_positions')
          .select('isbn')
          .range(legacyPage * PAGE_SIZE, (legacyPage + 1) * PAGE_SIZE - 1);

        if (legacyError) {
          console.error('Error fetching legacy PNBA ISBNs:', legacyError);
          throw legacyError;
        }

        if (!legacyBooks || legacyBooks.length === 0) {
          hasMoreLegacy = false;
        } else {
          legacyBooks.forEach((b: any) => targetIsbns.add(b.isbn));
          hasMoreLegacy = legacyBooks.length === PAGE_SIZE;
          legacyPage++;
        }
      }

      console.log(`Found ${legacyPage} pages from legacy book_positions table. Total unique ISBNs to exclude: ${targetIsbns.size}`);
    }

    // Step 2: Get books from ALL regions (last 4 weeks) to capture full regional performance
    // We'll filter by comparison regions later when determining which books to show
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const fourWeeksAgoStr = fourWeeksAgo.toISOString().split('T')[0];

    let allRegionalBooks: any[] = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      // Fetch from ALL regions except target to get complete regional performance data
      const query = supabase
        .from('regional_bestsellers')
        .select('*')
        .gte('week_date', fourWeeksAgoStr)
        .neq('region', filters.targetRegion)
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        .order('week_date', { ascending: false });

      const { data: pageData, error: regionalError } = await query;

      if (regionalError) {
        console.error('Error fetching regional books:', regionalError);
        throw regionalError;
      }

      if (!pageData || pageData.length === 0) {
        hasMore = false;
      } else {
        allRegionalBooks = allRegionalBooks.concat(pageData);
        hasMore = pageData.length === PAGE_SIZE;
        page++;
      }
    }

    console.log(`Found ${allRegionalBooks.length} regional books in last 4 weeks (${page} pages)`);

    // Step 3: Group by ISBN and exclude target region books
    const bookMap = new Map<string, {
      isbn: string;
      title: string;
      author: string;
      publisher?: string;
      category?: string;
      regionalPerf: Map<string, {
        ranks: number[];
        weeks: number;
        category?: string;
      }>;
    }>();

    for (const book of allRegionalBooks) {
      // Skip books that appear in target region
      if (targetIsbns.has(book.isbn)) continue;

      if (!bookMap.has(book.isbn)) {
        bookMap.set(book.isbn, {
          isbn: book.isbn,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          category: book.category,
          regionalPerf: new Map(),
        });
      }

      const bookData = bookMap.get(book.isbn)!;

      if (!bookData.regionalPerf.has(book.region)) {
        bookData.regionalPerf.set(book.region, {
          ranks: [],
          weeks: 0,
          category: book.category,
        });
      }

      const regionData = bookData.regionalPerf.get(book.region)!;
      regionData.ranks.push(book.rank);
      regionData.weeks++;
    }

    console.log(`Found ${bookMap.size} unique books not in ${filters.targetRegion}`);

    // Step 4: Convert to ElsewhereBook format
    const elsewhereBooks: ElsewhereBook[] = [];

    for (const [isbn, bookData] of bookMap.entries()) {
      const regionalPerformance: RegionalPerformance[] = [];
      let totalWeeks = 0;
      let bestRankOverall = Infinity;

      for (const [region, perfData] of bookData.regionalPerf.entries()) {
        const bestRank = Math.min(...perfData.ranks);
        const currentRank = perfData.ranks[0] || null; // Most recent rank (sorted desc)
        const trend = calculateTrend(currentRank, bestRank, perfData.weeks);

        regionalPerformance.push({
          region,
          currentRank,
          weeksOnList: perfData.weeks,
          bestRank,
          trend,
          category: perfData.category,
        });

        totalWeeks += perfData.weeks;
        bestRankOverall = Math.min(bestRankOverall, bestRank);
      }

      const averageRank = regionalPerformance.reduce(
        (sum, perf) => sum + perf.bestRank,
        0
      ) / regionalPerformance.length;

      elsewhereBooks.push({
        isbn,
        title: bookData.title,
        author: bookData.author,
        publisher: bookData.publisher,
        category: bookData.category,
        regionalPerformance,
        aggregateMetrics: {
          totalRegions: regionalPerformance.length,
          totalWeeksAcrossAllRegions: totalWeeks,
          bestRankAchieved: bestRankOverall,
          averageRank: Math.round(averageRank * 10) / 10,
        },
      });
    }

    // Step 5: Filter by comparison regions (keep books that appear in at least one)
    let filtered = elsewhereBooks;

    if (filters.comparisonRegions.length > 0) {
      filtered = filtered.filter(book =>
        book.regionalPerformance.some(perf =>
          filters.comparisonRegions.includes(perf.region)
        )
      );
    }

    console.log(`After comparison region filter: ${filtered.length} books`);

    // Step 6: Apply other filters
    // Filter by minimum weeks
    if (filters.minWeeksOnList) {
      filtered = filtered.filter(
        book => book.aggregateMetrics.totalWeeksAcrossAllRegions >= filters.minWeeksOnList!
      );
    }

    // Filter by minimum regions
    if (filters.minRegions) {
      filtered = filtered.filter(
        book => book.aggregateMetrics.totalRegions >= filters.minRegions!
      );
    }

    // Filter by search
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        book =>
          book.title.toLowerCase().includes(searchLower) ||
          book.author.toLowerCase().includes(searchLower) ||
          book.isbn.includes(searchLower)
      );
    }

    // Step 7: Sort
    switch (filters.sortBy) {
      case 'most_regions':
        filtered.sort((a, b) => b.aggregateMetrics.totalRegions - a.aggregateMetrics.totalRegions);
        break;
      case 'best_rank':
        filtered.sort((a, b) => a.aggregateMetrics.bestRankAchieved - b.aggregateMetrics.bestRankAchieved);
        break;
      case 'total_weeks':
        filtered.sort((a, b) => b.aggregateMetrics.totalWeeksAcrossAllRegions - a.aggregateMetrics.totalWeeksAcrossAllRegions);
        break;
      case 'newest':
        // For newest, prioritize books with 'new' trend and fewer weeks
        filtered.sort((a, b) => {
          const aNew = a.regionalPerformance.filter(p => p.trend === 'new').length;
          const bNew = b.regionalPerformance.filter(p => p.trend === 'new').length;
          if (aNew !== bNew) return bNew - aNew;
          return a.aggregateMetrics.totalWeeksAcrossAllRegions - b.aggregateMetrics.totalWeeksAcrossAllRegions;
        });
        break;
    }

    // Step 8: Apply pagination
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const totalPages = Math.ceil(filtered.length / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedBooks = filtered.slice(startIndex, endIndex);

    const elapsed = Date.now() - startTime;
    console.log(`Fetched ${paginatedBooks.length} of ${filtered.length} elsewhere books (page ${page}/${totalPages}) in ${elapsed}ms`);

    return {
      books: paginatedBooks,
      totalCount: filtered.length,
      availableRegions: filters.comparisonRegions,
      weekDate: new Date().toISOString().split('T')[0],
      lastUpdated: new Date().toISOString(),
      page,
      pageSize,
      totalPages,
    };
  } catch (error) {
    console.error('Error in fetchElsewhereBooks:', error);
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Parse request body
    const filters: ElsewhereFilters = await req.json();

    // Validate required fields
    if (!filters.targetRegion) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'targetRegion is required',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!filters.comparisonRegions || !Array.isArray(filters.comparisonRegions)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'comparisonRegions must be an array',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (!filters.sortBy) {
      filters.sortBy = 'most_regions'; // Default sort
    }

    // Create Supabase client with service role (for unrestricted queries)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch elsewhere books
    const result = await fetchElsewhereBooks(supabase, filters);

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in fetch-elsewhere-books:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
