import { schedules, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import {
  assembleFeedJson,
  type CurrentBook,
  type PreviousWeekBook,
} from "./feedGenerator";
import { generateElsewhereFeeds } from "./generate-elsewhere-feeds";
import { scrapeGoogleDriveUrls, cacheDriveUrls } from "./bookweb-scraper";

// Region configuration (sync with src/config/regions.ts)
const REGIONS = [
  { abbreviation: "PNBA", file_code: "pn", full_name: "Pacific Northwest Booksellers Association" },
  { abbreviation: "CALIBAN", file_code: "nc", full_name: "California Independent Booksellers Alliance (North)" },
  { abbreviation: "CALIBAS", file_code: "sc", full_name: "California Independent Booksellers Alliance (South)" },
  { abbreviation: "GLIBA", file_code: "gl", full_name: "Great Lakes Independent Booksellers Association" },
  { abbreviation: "MPIBA", file_code: "mp", full_name: "Mountains & Plains Independent Booksellers Association" },
  { abbreviation: "MIBA", file_code: "mw", full_name: "Midwest Independent Booksellers Association" },
  { abbreviation: "NAIBA", file_code: "na", full_name: "New Atlantic Independent Booksellers Association" },
  { abbreviation: "NEIBA", file_code: "ne", full_name: "New England Independent Booksellers Association" },
  { abbreviation: "SIBA", file_code: "si", full_name: "Southern Independent Booksellers Alliance" },
];

interface RegionalBook {
  region: string;
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  rank: number;
  category: string | null;
  week_date: string;
  list_title: string | null;
  price: string | null;
}

function getMostRecentWednesday(date?: Date): Date {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay();
  const diff = day >= 3 ? day - 3 : day + 4;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatAsYYMMDD(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatAsISO(date: Date): string {
  return date.toISOString().split("T")[0];
}

function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[-\s]/g, "");
}

function getListTitle(regionAbbr: string): string {
  const region = REGIONS.find((r) => r.abbreviation === regionAbbr);
  return region
    ? `${regionAbbr} Independent Bestsellers`
    : "Regional Bestsellers";
}

function parseRegionalList(
  content: string,
  region: string,
  weekDate: string
): RegionalBook[] {
  const lines = content
    .split(/\r?\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line);
  const books: RegionalBook[] = [];
  let currentCategory = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (
      line.includes("INDEPENDENT BESTSELLERS") ||
      line.includes("Sales Week Ended") ||
      line.includes("Compiled by") ||
      line === "" ||
      line.startsWith("For more information")
    ) {
      continue;
    }

    // Category header: all caps, no leading numbers
    if (line.match(/^[A-Z\s]+$/) && line.length > 3 && !line.match(/^\d+/)) {
      currentCategory = line;
      continue;
    }

    // Book entry: starts with rank number
    const rankMatch = line.match(/^(\d+)\.\s*(.+)/);
    if (rankMatch) {
      const rank = parseInt(rankMatch[1]);
      const title = rankMatch[2].trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1] : "";

      if (nextLine && !nextLine.match(/^\d+\./)) {
        const details = nextLine.trim();
        const parts = details.split(",").map((part) => part.trim());

        if (parts.length >= 2) {
          const author = parts[0];
          const publisher = parts.length >= 3 ? parts[1] : null;
          let isbn = "";
          let price: string | null = null;

          for (const part of parts) {
            const cleanPart = normalizeIsbn(part);
            if (cleanPart.match(/^\d{10}(\d{3})?$/)) {
              isbn = cleanPart;
              break;
            }
          }

          const priceMatch = details.match(/\$\d+\.\d{2}/);
          if (priceMatch) {
            price = priceMatch[0];
          }

          if (isbn) {
            books.push({
              region,
              isbn,
              title,
              author,
              publisher,
              rank,
              category: currentCategory || null,
              week_date: weekDate,
              list_title: getListTitle(region),
              price,
            });
          }
        }
        i++; // Skip the details line
      }
    }
  }

  return books;
}

async function fetchRegionalList(
  region: { abbreviation: string; file_code: string },
  weekDate: Date,
  driveUrls?: Record<string, string>
): Promise<RegionalBook[]> {
  const dateStr = formatAsYYMMDD(weekDate);
  const isoDate = formatAsISO(weekDate);

  // Try Google Drive URL first if available
  const driveUrl = driveUrls?.[region.abbreviation];
  if (driveUrl) {
    logger.info(`Fetching ${region.abbreviation} from Google Drive`, { url: driveUrl });
    try {
      const response = await fetch(driveUrl);
      if (response.ok) {
        const content = await response.text();
        const books = parseRegionalList(content, region.abbreviation, isoDate);
        if (books.length > 0) {
          logger.info(`Parsed ${region.abbreviation} from Google Drive`, { bookCount: books.length });
          return books;
        }
        logger.warn(`Google Drive file for ${region.abbreviation} parsed 0 books, falling back to bookweb.org`);
      } else {
        logger.warn(`Google Drive fetch failed for ${region.abbreviation}`, { status: response.status });
      }
    } catch (error) {
      logger.warn(`Google Drive fetch error for ${region.abbreviation}`, { error: String(error) });
    }
  }

  // Fallback to old bookweb.org URL
  const url = `https://www.bookweb.org/sites/default/files/regional_bestseller/${dateStr}${region.file_code}.txt`;
  logger.info(`Fetching ${region.abbreviation} from bookweb.org`, { url });

  const response = await fetch(url);

  if (!response.ok) {
    logger.warn(`Failed to fetch ${region.abbreviation}`, {
      status: response.status,
    });
    return [];
  }

  const content = await response.text();
  const books = parseRegionalList(content, region.abbreviation, isoDate);

  logger.info(`Parsed ${region.abbreviation}`, { bookCount: books.length });
  return books;
}

function calculateScore(rank: number, listSize: number): number {
  if (rank < 1 || listSize < 1) return 0;
  return 100 * (1 - Math.log(rank) / Math.log(listSize + 1));
}

const RATE_LIMIT_DELAY = 500;
const BATCH_SIZE = 1000;

export const populateRegionalBestsellers = schedules.task({
  id: "populate-regional-bestsellers",
  cron: { pattern: "*/20 8-10 * * 3", timezone: "America/Los_Angeles" },
  run: async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const weekDate = getMostRecentWednesday();
    const weekDateISO = formatAsISO(weekDate);

    // Early exit: check which regions already have data for this week
    const regionChecks = await Promise.all(
      REGIONS.map((r) =>
        supabase
          .from("regional_bestsellers")
          .select("isbn", { count: "exact", head: true })
          .eq("week_date", weekDateISO)
          .eq("region", r.abbreviation)
          .then((res) => ({
            region: r.abbreviation,
            hasData: !res.error && (res.count ?? 0) > 0,
          }))
      )
    );

    const populatedRegions = regionChecks.filter((r) => r.hasData);
    const alreadyPopulatedAll = populatedRegions.length >= REGIONS.length;

    // Accumulators hoisted so Phase 4 can run even when Phases 1-2 are skipped
    const allBooks: RegionalBook[] = [];
    const successfulRegions: string[] = [];
    let insertedCount = 0;
    let errorCount = 0;
    let totalScores = 0;

    if (alreadyPopulatedAll) {
      logger.info("All regions already populated for this week, skipping fetch", {
        weekDate: weekDateISO,
        regions: populatedRegions.map((r) => r.region),
      });
    } else {
      const missingRegions = regionChecks
        .filter((r) => !r.hasData)
        .map((r) => r.region);

      // Scrape Google Drive URLs once before fetching individual regions
      let driveUrls: Record<string, string> = {};
      try {
        const scrapeResult = await scrapeGoogleDriveUrls();
        driveUrls = scrapeResult.urls;
        logger.info("Scraped Google Drive URLs", {
          regionCount: Object.keys(driveUrls).length,
          regions: Object.keys(driveUrls),
          weekEndDate: scrapeResult.weekEndDate,
        });

        // Persist Drive URLs to fetch_cache so they survive across weeks
        await cacheDriveUrls(scrapeResult, supabase);
      } catch (error) {
        logger.warn("Failed to scrape Google Drive URLs, will use bookweb.org fallback", {
          error: String(error),
        });
      }

      logger.info("Starting regional bestseller population", {
        weekDate: weekDateISO,
        regionCount: REGIONS.length,
        alreadyPopulated: populatedRegions.length,
        missingRegions,
      });

      // --- Phase 1: Fetch and upsert regional bestsellers ---

      const regionsToFetch = REGIONS.filter((r) =>
        missingRegions.includes(r.abbreviation)
      );

      for (const region of regionsToFetch) {
        try {
          const books = await fetchRegionalList(region, weekDate, driveUrls);
          if (books.length > 0) {
            allBooks.push(...books);
            successfulRegions.push(region.abbreviation);
          }
          // Rate limit between requests
          await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY));
        } catch (error) {
          logger.error(`Error fetching ${region.abbreviation}`, {
            error: String(error),
          });
        }
      }

      logger.info("Fetch phase complete", {
        totalBooks: allBooks.length,
        successfulRegions,
      });

      if (allBooks.length === 0) {
        logger.warn("No books fetched from any region, aborting");
        return { success: false, reason: "no_books_fetched" };
      }

      // Batch upsert to regional_bestsellers
      for (let i = 0; i < allBooks.length; i += BATCH_SIZE) {
        const batch = allBooks.slice(i, i + BATCH_SIZE);

        const { error } = await supabase
          .from("regional_bestsellers")
          .upsert(batch, {
            onConflict: "region,isbn,week_date",
            ignoreDuplicates: false,
          });

        if (error) {
          logger.error(`Upsert batch ${Math.floor(i / BATCH_SIZE) + 1} failed`, {
            error: error.message,
          });
          errorCount += batch.length;
        } else {
          insertedCount += batch.length;
          logger.info(
            `Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} books`
          );
        }
      }

      // --- Phase 2: Calculate weekly scores (inlined from calculate-weekly-scores) ---

      for (const regionCode of successfulRegions) {
        const { data: books, error: fetchError } = await supabase
          .from("regional_bestsellers")
          .select("isbn, region, week_date, rank, category")
          .eq("week_date", weekDateISO)
          .eq("region", regionCode);

        if (fetchError) {
          logger.error(`Failed to fetch books for scoring: ${regionCode}`, {
            error: fetchError.message,
          });
          continue;
        }

        if (!books || books.length === 0) {
          logger.warn(`No books found for scoring: ${regionCode}`);
          continue;
        }

        // Determine list_size per category
        const categoryListSizes: Record<string, number> = {};
        books.forEach(
          (book: { category: string | null; rank: number; isbn: string }) => {
            const cat = book.category || "General";
            categoryListSizes[cat] = (categoryListSizes[cat] || 0) + 1;
          }
        );

        // Calculate scores
        const scores = books.map(
          (book: {
            isbn: string;
            region: string;
            week_date: string;
            rank: number;
            category: string | null;
          }) => {
            const cat = book.category || "General";
            const listSize = categoryListSizes[cat];
            return {
              isbn: book.isbn,
              region: book.region,
              week_date: book.week_date,
              rank: book.rank,
              category: cat,
              list_size: listSize,
              points: calculateScore(book.rank, listSize),
            };
          }
        );

        const { error: upsertError } = await supabase
          .from("weekly_scores")
          .upsert(scores, {
            onConflict: "isbn,region,week_date,category",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          logger.error(`Failed to upsert scores for ${regionCode}`, {
            error: upsertError.message,
          });
        } else {
          totalScores += scores.length;
          logger.info(`Scores calculated for ${regionCode}`, {
            count: scores.length,
            categories: Object.keys(categoryListSizes),
          });
        }
      }
    }

    // --- Phase 3: Cleanup old data (keep last 52 weeks) ---

    const cutoffDate = new Date(weekDate);
    cutoffDate.setDate(cutoffDate.getDate() - 52 * 7);
    const cutoffDateISO = formatAsISO(cutoffDate);

    const { error: deleteError } = await supabase
      .from("regional_bestsellers")
      .delete()
      .lt("week_date", cutoffDateISO);

    if (deleteError) {
      logger.warn("Error cleaning up old data", {
        error: deleteError.message,
      });
    } else {
      logger.info(`Cleaned up data older than ${cutoffDateISO}`);
    }

    // --- Phase 4: Generate regional JSON feeds ---

    // Iterate over all regions with current-week data (fetched this run +
    // already populated at run start), so feeds regenerate on any trigger
    const regionsWithData = Array.from(
      new Set([
        ...populatedRegions.map((r) => r.region),
        ...successfulRegions,
      ])
    );

    const feedGeneration: {
      succeeded: string[];
      skipped: Array<{ region: string; reason: string }>;
      failed: Array<{
        region: string;
        outcome: "transient_error" | "permanent_error";
        error: string;
        retriable: boolean;
      }>;
    } = { succeeded: [], skipped: [], failed: [] };

    // Previous week (for "last" rank computation)
    const previousWeekDate = new Date(weekDate);
    previousWeekDate.setUTCDate(previousWeekDate.getUTCDate() - 7);
    const previousWeekDateISO = formatAsISO(previousWeekDate);

    for (const regionCode of regionsWithData) {
      const region = REGIONS.find((r) => r.abbreviation === regionCode);
      if (!region) {
        feedGeneration.skipped.push({
          region: regionCode,
          reason: "region_not_in_constant",
        });
        continue;
      }

      try {
        // Fetch current week's books for this region
        const { data: currentRows, error: currentErr } = await supabase
          .from("regional_bestsellers")
          .select("isbn, title, author, publisher, rank, category")
          .eq("week_date", weekDateISO)
          .eq("region", regionCode)
          .order("rank", { ascending: true });

        if (currentErr) throw new Error(`current week query: ${currentErr.message}`);
        if (!currentRows || currentRows.length === 0) {
          feedGeneration.skipped.push({
            region: regionCode,
            reason: "no_books_current_week",
          });
          continue;
        }

        const currentBooks: CurrentBook[] = currentRows;
        const isbns = currentBooks.map((b) => b.isbn);

        // Fetch previous week's rows for "last" computation
        const { data: previousRows, error: previousErr } = await supabase
          .from("regional_bestsellers")
          .select("isbn, rank")
          .eq("week_date", previousWeekDateISO)
          .eq("region", regionCode);

        if (previousErr) throw new Error(`previous week query: ${previousErr.message}`);
        const previousBooks: PreviousWeekBook[] = previousRows ?? [];

        // Fetch weeks-on-list via RPC
        const { data: wolRows, error: wolErr } = await supabase.rpc(
          "get_weeks_on_list_batch_regional",
          { isbn_list: isbns, target_region: regionCode }
        );

        if (wolErr) throw new Error(`weeks-on-list RPC: ${wolErr.message}`);
        const weeksOnList: Record<string, number> = {};
        for (const row of (wolRows ?? []) as Array<{ isbn: string; weeks_on_list: number }>) {
          weeksOnList[row.isbn] = row.weeks_on_list;
        }

        // Fetch descriptions from fetch_cache (batched, single query per region)
        const cacheKeys = isbns.map((isbn) => `google_books_info_${isbn}`);
        const { data: cacheRows, error: cacheErr } = await supabase
          .from("fetch_cache")
          .select("cache_key, data")
          .in("cache_key", cacheKeys);

        if (cacheErr) throw new Error(`fetch_cache query: ${cacheErr.message}`);
        const descriptions: Record<string, string> = {};
        for (const row of (cacheRows ?? []) as Array<{ cache_key: string; data: { description?: string } | null }>) {
          const isbn = row.cache_key.replace("google_books_info_", "");
          const desc = row.data?.description;
          if (typeof desc === "string") {
            descriptions[isbn] = desc;
          }
        }

        // Assemble and upload
        const feed = assembleFeedJson({
          region: { abbreviation: region.abbreviation, full_name: region.full_name },
          weekDate,
          currentBooks,
          previousBooks,
          weeksOnList,
          descriptions,
        });

        const json = JSON.stringify(feed);
        const buffer = new TextEncoder().encode(json);

        const { error: uploadErr } = await supabase.storage
          .from("feeds")
          .upload(`region/${regionCode}.json`, buffer, {
            upsert: true,
            contentType: "application/json",
            cacheControl: "604800",
          });

        if (uploadErr) throw new Error(`upload: ${uploadErr.message}`);

        logger.info(`Feed generated for ${regionCode}`, {
          bytes: buffer.byteLength,
          sections: feed.sections.length,
          entries: feed.sections.reduce((n, s) => n + s.entries.length, 0),
        });
        feedGeneration.succeeded.push(regionCode);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Regional feed generation failed`, {
          region: regionCode,
          outcome: "transient_error",
          error: message,
          retriable: true,
          weekDate: weekDateISO,
        });
        feedGeneration.failed.push({
          region: regionCode,
          outcome: "transient_error",
          error: message,
          retriable: true,
        });
      }
    }

    // If all regions failed, throw so Trigger.dev retries the task
    if (
      feedGeneration.succeeded.length === 0 &&
      feedGeneration.failed.length === regionsWithData.length &&
      regionsWithData.length > 0
    ) {
      throw new Error(
        `All ${regionsWithData.length} regions failed feed generation`
      );
    }

    // --- Phase 5: Trigger elsewhere feed generation ---
    await generateElsewhereFeeds.trigger();
    logger.info("Triggered elsewhere feed generation");

    const result = {
      success: true,
      weekDate: weekDateISO,
      regionsProcessed: successfulRegions,
      totalBooksFetched: allBooks.length,
      insertedCount,
      errorCount,
      totalScoresCalculated: totalScores,
      feedGeneration,
    };

    logger.info("Regional bestseller population complete", result);
    return result;
  },
});
