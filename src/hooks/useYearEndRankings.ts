import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { BookRanking, RankingCategory } from '@/types/performance';

/**
 * Fetch year-end rankings for a specific category
 *
 * OPTIMIZATION NOTE: This currently makes 1-2 queries per category:
 * 1. Fetch metrics/performance data
 * 2. Fetch book title/author from regional_bestsellers
 *
 * For better performance, consider denormalizing title/author into the
 * performance metrics tables during aggregation (update-book-metrics).
 * This would eliminate the second query entirely.
 */
async function fetchRankings(
  category: RankingCategory,
  year: number,
  region?: string
): Promise<BookRanking[]> {
  try {
    if (category === 'regional_top10s' && region) {
      // Regional Top 10s
      // Fetch extra books to allow for frontlist filtering (will be sliced in UI)
      const { data, error } = await supabase
        .from('book_regional_performance')
        .select(`
          isbn,
          regional_score,
          regional_strength_index,
          weeks_on_chart,
          best_rank,
          avg_score_per_week
        `)
        .eq('year', year)
        .eq('region', region)
        .order('regional_score', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch book details (short-circuit if no data)
      const isbns = data.map((d: any) => d.isbn);
      if (isbns.length === 0) return [];

      // Use distinct_books view (one row per ISBN, no duplicates)
      const { data: books, error: booksError } = await supabase
        .from('distinct_books')
        .select('isbn, title, author')
        .in('isbn', isbns);

      if (booksError) throw booksError;

      const bookMap = new Map(books?.map((b: any) => [b.isbn, b]) || []);

      return data.map((d: any) => ({
        isbn: d.isbn,
        title: bookMap.get(d.isbn)?.title || 'Unknown',
        author: bookMap.get(d.isbn)?.author || 'Unknown',
        score: Number(d.regional_score),
        metadata: {
          weeksOnChart: Number(d.weeks_on_chart),
          bestRank: Number(d.best_rank),
          avgScorePerWeek: Number(d.avg_score_per_week),
          rsi: Number(d.regional_strength_index),
        },
      }));
    }

    if (category === 'most_regional') {
      console.log('🔍 most_regional query started');

      // Three-stage pool algorithm:
      // 1. Top 100 books by total_score (national hits)
      // 2. Top 10 per region by regional_score (regional phenomena)
      // 3. Books with RSI ≥ 0.45 in any region (high regional dominance)
      // Then filter: exclude books with max_rsi ≤ 0.35 (evenly distributed)
      // Finally: assign each book to region with highest RSI, create 8 lists with zero duplicates

      try {
      // Stage 1: Get top 100 books by total_score
      console.log('🔍 Stage 1: Fetching top 100 national hits...');
      const { data: nationalHits, error: nationalError } = await supabase
        .from('book_performance_metrics')
        .select('isbn, total_score')
        .eq('year', year)
        .order('total_score', { ascending: false })
        .limit(100);

      if (nationalError) throw nationalError;
      console.log(`🔍 Stage 1: Got ${nationalHits?.length || 0} national hits`);

      // Stage 2: Get top 10 per region by regional_score
      // Need to query each region separately to ensure 10 per region
      console.log('🔍 Stage 2: Fetching top 10 per region...');
      const regions = ['PNBA', 'CALIBAN', 'CALIBAS', 'GLIBA', 'MPIBA', 'NAIBA', 'NEIBA', 'SIBA'];
      const regionalHitsPromises = regions.map(region =>
        supabase
          .from('book_regional_performance')
          .select('isbn, regional_score')
          .eq('year', year)
          .eq('region', region)
          .order('regional_score', { ascending: false })
          .limit(10)
      );

      const regionalResults = await Promise.all(regionalHitsPromises);
      const regionalHits = regionalResults.flatMap(result => result.data || []);
      console.log(`🔍 Stage 2: Got ${regionalHits.length} regional hits`);

      // Stage 3: Get books with high RSI (≥ 0.45 in any region)
      console.log('🔍 Stage 3: Fetching high RSI books (≥0.45)...');
      const { data: highRSIBooks, error: rsiError } = await supabase
        .from('book_regional_performance')
        .select('isbn')
        .eq('year', year)
        .gte('regional_strength_index', 0.45);

      if (rsiError) throw rsiError;
      console.log(`🔍 Stage 3: Got ${highRSIBooks?.length || 0} high RSI books`);

      // Combine and deduplicate
      const poolISBNs = new Set<string>();
      nationalHits?.forEach((b: any) => poolISBNs.add(b.isbn));
      regionalHits?.forEach((b: any) => poolISBNs.add(b.isbn));
      highRSIBooks?.forEach((b: any) => poolISBNs.add(b.isbn));

      const topISBNs = Array.from(poolISBNs);
      console.log(`🔍 Combined pool: ${topISBNs.length} unique ISBNs`);
      if (topISBNs.length === 0) return [];

      // Get total_score for all books in pool (need this for final ranking)
      // Batch into chunks of 500 to avoid Supabase .in() limit
      console.log('🔍 Fetching total_scores for pool...');
      const chunkSize = 500;
      const topBooksChunks = [];

      for (let i = 0; i < topISBNs.length; i += chunkSize) {
        const chunk = topISBNs.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('book_performance_metrics')
          .select('isbn, total_score')
          .eq('year', year)
          .in('isbn', chunk);

        if (error) throw error;
        if (data) topBooksChunks.push(...data);
      }

      const topBooks = topBooksChunks;
      console.log(`🔍 Got total_scores for ${topBooks?.length || 0} books`);

      // Step 3: Get all regional performance data for these books
      // Batch into chunks of 500 to avoid Supabase .in() limit
      console.log('🔍 Fetching regional performance data...');
      const regionalDataChunks = [];

      for (let i = 0; i < topISBNs.length; i += chunkSize) {
        const chunk = topISBNs.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from('book_regional_performance')
          .select(`
            isbn,
            region,
            regional_score,
            regional_strength_index,
            weeks_on_chart
          `)
          .eq('year', year)
          .in('isbn', chunk);

        if (error) throw error;
        if (data) regionalDataChunks.push(...data);
      }

      const regionalData = regionalDataChunks;
      console.log(`🔍 Got ${regionalData?.length || 0} regional performance rows`);
      if (!regionalData || regionalData.length === 0) return [];

      // Step 4: Filter out evenly distributed books (max RSI < 0.30)
      const bookMaxRSI = new Map<string, number>();
      regionalData.forEach((d: any) => {
        const isbn = d.isbn;
        const rsi = Number(d.regional_strength_index);
        const currentMax = bookMaxRSI.get(isbn) || 0;
        if (rsi > currentMax) {
          bookMaxRSI.set(isbn, rsi);
        }
      });

      // Filter: only include books where max_rsi > 0.35 (>35% from one region)
      const qualifyingISBNs = new Set<string>();
      bookMaxRSI.forEach((maxRSI, isbn) => {
        if (maxRSI > 0.35) {
          qualifyingISBNs.add(isbn);
        }
      });

      console.log(`🔍 Pool before filter: ${topISBNs.length} books, after RSI filter (>0.35): ${qualifyingISBNs.size} books`);

      // Step 5: For each qualifying book, find region with highest RSI
      const bookToMaxRegion = new Map<string, { region: string; rsi: number; regionalScore: number; weeksOnChart: number; totalScore: number }>();

      regionalData.forEach((d: any) => {
        const isbn = d.isbn;
        if (!qualifyingISBNs.has(isbn)) return; // Skip filtered-out books

        const currentMax = bookToMaxRegion.get(isbn);
        const rsi = Number(d.regional_strength_index);

        if (!currentMax || rsi > currentMax.rsi) {
          const totalScore = topBooks?.find((b: any) => b.isbn === isbn)?.total_score || 0;
          bookToMaxRegion.set(isbn, {
            region: d.region,
            rsi,
            regionalScore: Number(d.regional_score),
            weeksOnChart: Number(d.weeks_on_chart),
            totalScore: Number(totalScore),
          });
        }
      });

      // Step 6: Group by region and sort by total_score
      const byRegion = new Map<string, Array<{ isbn: string; totalScore: number; rsi: number; regionalScore: number; weeksOnChart: number }>>();

      bookToMaxRegion.forEach((data, isbn) => {
        if (!byRegion.has(data.region)) {
          byRegion.set(data.region, []);
        }
        byRegion.get(data.region)!.push({
          isbn,
          totalScore: data.totalScore,
          rsi: data.rsi,
          regionalScore: data.regionalScore,
          weeksOnChart: data.weeksOnChart,
        });
      });

      // Step 7: Sort each region's books by weighted score (regional_score * rsi_boost) and take top 25
      // RSI boost: Linear scale from 1.0x at 35% RSI to 1.5x at 100% RSI
      // This gives advantage to books with higher regional concentration
      // Note: We fetch 25 per region to allow for frontlist filtering (will be sliced to 10 in UI)
      const calculateRSIBoost = (rsi: number): number => {
        return 1.0 + ((rsi - 0.35) / 0.65) * 0.5;
      };

      const allISBNs = new Set<string>();
      const regionalTop25s: Array<{ isbn: string; region: string; totalScore: number; rsi: number; regionalScore: number; weeksOnChart: number }> = [];

      byRegion.forEach((books, region) => {
        console.log(`🔍 ${region} has ${books.length} books assigned`);

        // Sort by weighted score: regional_score * rsi_boost
        const sorted = books.sort((a, b) => {
          const scoreA = a.regionalScore * calculateRSIBoost(a.rsi);
          const scoreB = b.regionalScore * calculateRSIBoost(b.rsi);
          return scoreB - scoreA;
        });

        if (region === 'PNBA') {
          console.log(`🔍 PNBA ALL books by weighted score:`, sorted.map((b, i) => ({
            rank: i + 1,
            isbn: b.isbn,
            regionalScore: b.regionalScore,
            rsi: b.rsi,
            boost: calculateRSIBoost(b.rsi).toFixed(2),
            weightedScore: (b.regionalScore * calculateRSIBoost(b.rsi)).toFixed(1)
          })));
        } else {
          console.log(`🔍 ${region} top 25 by weighted score:`, sorted.slice(0, 25).map(b => ({
            isbn: b.isbn,
            regionalScore: b.regionalScore,
            rsi: b.rsi,
            boost: calculateRSIBoost(b.rsi).toFixed(2),
            weightedScore: (b.regionalScore * calculateRSIBoost(b.rsi)).toFixed(1)
          })));
        }

        // Take top 25 per region (will be filtered and sliced to 10 in UI)
        const top25 = sorted.slice(0, 25);

        top25.forEach(book => {
          allISBNs.add(book.isbn);
          regionalTop25s.push({ ...book, region });
        });
      });

      // Step 8: Fetch book metadata
      const { data: bookMetadata, error: metadataError } = await supabase
        .from('distinct_books')
        .select('isbn, title, author')
        .in('isbn', Array.from(allISBNs));

      if (metadataError) throw metadataError;

      const bookMap = new Map(bookMetadata?.map((b: any) => [b.isbn, b]) || []);

      // Step 9: Format results
      return regionalTop25s.map((d) => ({
        isbn: d.isbn,
        title: bookMap.get(d.isbn)?.title || 'Unknown',
        author: bookMap.get(d.isbn)?.author || 'Unknown',
        score: d.regionalScore, // Display regional_score (what we're ranking by)
        metadata: {
          region: d.region,
          rsi: d.rsi,
          regionalScore: d.regionalScore,
          totalScore: d.totalScore, // Include for context
          weeksOnChart: d.weeksOnChart,
        },
      }));
      } catch (error) {
        console.error('❌ Error in most_regional query:', error);
        logger.error('useYearEndRankings', 'most_regional query failed', error);
        throw error;
      }
    }

    if (category === 'most_national') {
      // Books with lowest RSI variance
      // Fetch extra to allow for frontlist filtering (will be sliced in UI)
      const { data, error } = await supabase
        .from('book_performance_metrics')
        .select('isbn, total_score, rsi_variance, regions_appeared, weeks_on_chart')
        .eq('year', year)
        .gte('regions_appeared', 5)
        .order('rsi_variance', { ascending: true })
        .limit(50);

      if (error) throw error;

      const isbns = data.map((d: any) => d.isbn);
      if (isbns.length === 0) return [];

      // Use distinct_books view (one row per ISBN, no duplicates)
      const { data: books, error: booksError } = await supabase
        .from('distinct_books')
        .select('isbn, title, author')
        .in('isbn', isbns);

      if (booksError) throw booksError;

      const bookMap = new Map(books?.map((b: any) => [b.isbn, b]) || []);

      return data.map((d: any) => ({
        isbn: d.isbn,
        title: bookMap.get(d.isbn)?.title || 'Unknown',
        author: bookMap.get(d.isbn)?.author || 'Unknown',
        score: Number(d.total_score),
        metadata: {
          rsiVariance: Number(d.rsi_variance),
          regionsAppeared: Number(d.regions_appeared),
          weeksOnChart: Number(d.weeks_on_chart),
        },
      }));
    }

    if (category === 'most_efficient') {
      // Books with highest avg_score_per_week
      // Require minimum 4 weeks on chart to avoid one-hit wonders
      // Fetch extra to allow for frontlist filtering (will be sliced in UI)
      const { data, error } = await supabase
        .from('book_performance_metrics')
        .select('isbn, avg_score_per_week, total_score, weeks_on_chart')
        .eq('year', year)
        .gte('weeks_on_chart', 4)
        .order('avg_score_per_week', { ascending: false })
        .limit(50);

      if (error) throw error;

      const isbns = data.map((d: any) => d.isbn);
      if (isbns.length === 0) return [];

      // Use distinct_books view (one row per ISBN, no duplicates)
      const { data: books, error: booksError } = await supabase
        .from('distinct_books')
        .select('isbn, title, author')
        .in('isbn', isbns);

      if (booksError) throw booksError;

      const bookMap = new Map(books?.map((b: any) => [b.isbn, b]) || []);

      return data.map((d: any) => ({
        isbn: d.isbn,
        title: bookMap.get(d.isbn)?.title || 'Unknown',
        author: bookMap.get(d.isbn)?.author || 'Unknown',
        score: Number(d.avg_score_per_week),
        metadata: {
          totalScore: Number(d.total_score),
          weeksOnChart: Number(d.weeks_on_chart),
        },
      }));
    }

    return [];
  } catch (error) {
    logger.error('useYearEndRankings', `Failed to fetch ${category}`, error);
    throw error;
  }
}

/**
 * React Query hook for fetching year-end rankings
 *
 * @param category - Type of ranking to fetch
 * @param year - Year for rankings (defaults to 2025)
 * @param region - Region code (required for regional_top10s)
 * @returns Query result with rankings array
 */
export function useYearEndRankings(
  category: RankingCategory,
  year: number = 2025,
  region?: string
) {
  return useQuery({
    queryKey: ['yearEndRankings', category, year, region, 'v8'], // v8: increased limits for frontlist filtering
    queryFn: () => fetchRankings(category, year, region),
    staleTime: 1000 * 60 * 60 * 24, // 24 hours (year-end data is stable)
    enabled: category !== 'regional_top10s' || !!region,
  });
}
