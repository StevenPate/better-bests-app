import { task, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";

// Region configuration (sync with src/config/regions.ts)
const REGIONS = [
  "PNBA",
  "CALIBAN",
  "CALIBAS",
  "GLIBA",
  "MPIBA",
  "MIBA",
  "NAIBA",
  "NEIBA",
  "SIBA",
];

const PAGE_SIZE = 1000;
const LOOKBACK_DAYS = 28;
const TARGET_LOOKBACK_DAYS = 365;

type Trend = "rising" | "stable" | "falling" | "new";

interface RegionalPerformance {
  region: string;
  currentRank: number | null;
  weeksOnList: number;
  bestRank: number;
  trend: Trend;
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
  firstSeenDate?: string;
  lastSeenDate?: string;
}

interface ElsewhereFeed {
  title: string;
  description: string;
  generated_at: string;
  target_region: string;
  comparison_regions: string[];
  book_count: number;
  books: ElsewhereBook[];
}

interface RegionalBestsellerRow {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  category?: string;
  region: string;
  rank: number;
  week_date: string;
}

function calculateTrend(
  currentRank: number | null,
  bestRank: number,
  weeksOnList: number
): Trend {
  if (weeksOnList <= 2) return "new";
  if (!currentRank) return "falling";
  if (currentRank - bestRank <= 2) return "rising";
  if (currentRank - bestRank > 5) return "falling";
  return "stable";
}

async function fetchAllIsbnsForRegion(
  supabase: ReturnType<typeof createClient>,
  region: string,
  cutoffDate: string
): Promise<Set<string>> {
  const isbns = new Set<string>();
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("regional_bestsellers")
      .select("isbn")
      .eq("region", region)
      .gte("week_date", cutoffDate)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (error) throw new Error(`target ISBNs query: ${error.message}`);

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      for (const row of data) {
        if (row.isbn) isbns.add(row.isbn);
      }
      hasMore = data.length === PAGE_SIZE;
      page += 1;
    }
  }

  return isbns;
}

async function fetchComparisonBooks(
  supabase: ReturnType<typeof createClient>,
  targetRegion: string,
  comparisonRegions: string[],
  cutoffDate: string
): Promise<RegionalBestsellerRow[]> {
  const allBooks: RegionalBestsellerRow[] = [];
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("regional_bestsellers")
      .select("isbn, title, author, publisher, category, region, rank, week_date")
      .in("region", comparisonRegions)
      .gte("week_date", cutoffDate)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order("week_date", { ascending: false });

    if (error) throw new Error(`comparison books query: ${error.message}`);

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allBooks.push(...(data as RegionalBestsellerRow[]));
      hasMore = data.length === PAGE_SIZE;
      page += 1;
    }
  }

  return allBooks;
}

function buildElsewhereBooks(
  regionalBooks: RegionalBestsellerRow[],
  targetIsbns: Set<string>
): ElsewhereBook[] {
  const bookMap = new Map<
    string,
    {
      isbn: string;
      title: string;
      author: string;
      publisher?: string;
      category?: string;
      regionalPerf: Map<
        string,
        {
          ranks: number[];
          weeks: number;
          category?: string;
          firstSeen?: string;
          lastSeen?: string;
        }
      >;
    }
  >();

  for (const book of regionalBooks) {
    if (!book.isbn || targetIsbns.has(book.isbn)) continue;

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
        firstSeen: book.week_date,
        lastSeen: book.week_date,
      });
    }

    const regionData = bookData.regionalPerf.get(book.region)!;
    regionData.ranks.push(book.rank);
    regionData.weeks += 1;

    if (!regionData.firstSeen || book.week_date < regionData.firstSeen) {
      regionData.firstSeen = book.week_date;
    }
    if (!regionData.lastSeen || book.week_date > regionData.lastSeen) {
      regionData.lastSeen = book.week_date;
    }
  }

  const elsewhereBooks: ElsewhereBook[] = [];

  for (const [isbn, bookData] of bookMap.entries()) {
    const regionalPerformance: RegionalPerformance[] = [];
    let totalWeeks = 0;
    let bestRankOverall = Infinity;
    let firstSeenDate: string | undefined;
    let lastSeenDate: string | undefined;

    for (const [region, perfData] of bookData.regionalPerf.entries()) {
      const bestRank = Math.min(...perfData.ranks);
      const currentRank = perfData.ranks[0] ?? null;
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

      if (
        !firstSeenDate ||
        (perfData.firstSeen && perfData.firstSeen < firstSeenDate)
      ) {
        firstSeenDate = perfData.firstSeen;
      }
      if (
        !lastSeenDate ||
        (perfData.lastSeen && perfData.lastSeen > lastSeenDate)
      ) {
        lastSeenDate = perfData.lastSeen;
      }
    }

    const aggregateMetrics: AggregateMetrics = {
      totalRegions: regionalPerformance.length,
      totalWeeksAcrossAllRegions: totalWeeks,
      bestRankAchieved: bestRankOverall === Infinity ? 0 : bestRankOverall,
      averageRank:
        regionalPerformance.length > 0
          ? Math.round(
              (regionalPerformance.reduce(
                (sum, perf) => sum + perf.bestRank,
                0
              ) /
                regionalPerformance.length) *
                10
            ) / 10
          : 0,
    };

    elsewhereBooks.push({
      isbn,
      title: bookData.title,
      author: bookData.author,
      publisher: bookData.publisher,
      category: bookData.category,
      regionalPerformance,
      aggregateMetrics,
      firstSeenDate,
      lastSeenDate,
    });
  }

  // Sort by newest (most recent firstSeenDate first)
  elsewhereBooks.sort((a, b) => {
    if (!a.firstSeenDate) return 1;
    if (!b.firstSeenDate) return -1;
    return b.firstSeenDate.localeCompare(a.firstSeenDate);
  });

  return elsewhereBooks;
}

export const generateElsewhereFeeds = task({
  id: "generate-elsewhere-feeds",
  retry: { maxAttempts: 3 },
  run: async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const targetCutoff = new Date(now);
    targetCutoff.setDate(targetCutoff.getDate() - TARGET_LOOKBACK_DAYS);
    const targetCutoffISO = targetCutoff.toISOString().split("T")[0];

    const comparisonCutoff = new Date(now);
    comparisonCutoff.setDate(comparisonCutoff.getDate() - LOOKBACK_DAYS);
    const comparisonCutoffISO = comparisonCutoff.toISOString().split("T")[0];

    const results: {
      succeeded: string[];
      failed: Array<{ region: string; error: string }>;
    } = { succeeded: [], failed: [] };

    for (const targetRegion of REGIONS) {
      try {
        const comparisonRegions = REGIONS.filter((r) => r !== targetRegion);

        logger.info(`Processing elsewhere feed for ${targetRegion}`, {
          comparisonRegions,
        });

        // Step 1: Fetch target region ISBNs (past year) for exclusion
        const targetIsbns = await fetchAllIsbnsForRegion(
          supabase,
          targetRegion,
          targetCutoffISO
        );

        logger.info(`Target ISBNs for ${targetRegion}`, {
          count: targetIsbns.size,
        });

        // Step 2: Fetch comparison region books (past 28 days)
        const comparisonBooks = await fetchComparisonBooks(
          supabase,
          targetRegion,
          comparisonRegions,
          comparisonCutoffISO
        );

        logger.info(`Comparison books for ${targetRegion}`, {
          count: comparisonBooks.length,
        });

        // Step 3: Build elsewhere book list
        const elsewhereBooks = buildElsewhereBooks(
          comparisonBooks,
          targetIsbns
        );

        logger.info(`Elsewhere books for ${targetRegion}`, {
          count: elsewhereBooks.length,
        });

        // Step 4: Assemble feed JSON
        const feed: ElsewhereFeed = {
          title: `Books from Elsewhere for ${targetRegion}`,
          description: `Bestselling books in other regions that have not appeared on ${targetRegion} lists in the past year`,
          generated_at: now.toISOString(),
          target_region: targetRegion,
          comparison_regions: comparisonRegions,
          book_count: elsewhereBooks.length,
          books: elsewhereBooks,
        };

        // Step 5: Upload to Supabase Storage
        const json = JSON.stringify(feed);
        const buffer = new TextEncoder().encode(json);

        const { error: uploadErr } = await supabase.storage
          .from("feeds")
          .upload(`elsewhere/${targetRegion}.json`, buffer, {
            upsert: true,
            contentType: "application/json",
            cacheControl: "604800",
          });

        if (uploadErr) throw new Error(`upload: ${uploadErr.message}`);

        logger.info(`Elsewhere feed uploaded for ${targetRegion}`, {
          bytes: buffer.byteLength,
          bookCount: elsewhereBooks.length,
        });

        results.succeeded.push(targetRegion);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Elsewhere feed failed for ${targetRegion}`, {
          error: message,
        });
        results.failed.push({ region: targetRegion, error: message });
      }
    }

    // If all regions failed, throw so Trigger.dev retries
    if (results.succeeded.length === 0 && results.failed.length > 0) {
      throw new Error(
        `All ${results.failed.length} regions failed elsewhere feed generation`
      );
    }

    logger.info("Elsewhere feed generation complete", results);
    return results;
  },
});
