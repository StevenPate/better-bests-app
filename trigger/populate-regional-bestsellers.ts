import { schedules, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";

// Region configuration (sync with src/config/regions.ts)
const REGIONS = [
  { abbreviation: "PNBA", file_code: "pn" },
  { abbreviation: "CALIBAN", file_code: "nc" },
  { abbreviation: "CALIBAS", file_code: "sc" },
  { abbreviation: "GLIBA", file_code: "gl" },
  { abbreviation: "MPIBA", file_code: "mp" },
  { abbreviation: "MIBA", file_code: "mw" },
  { abbreviation: "NAIBA", file_code: "na" },
  { abbreviation: "NEIBA", file_code: "ne" },
  { abbreviation: "SIBA", file_code: "si" },
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
    .split("\n")
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
  weekDate: Date
): Promise<RegionalBook[]> {
  const dateStr = formatAsYYMMDD(weekDate);
  const isoDate = formatAsISO(weekDate);
  const url = `https://www.bookweb.org/sites/default/files/regional_bestseller/${dateStr}${region.file_code}.txt`;

  logger.info(`Fetching ${region.abbreviation}`, { url });

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
  cron: "15 17 * * 3", // Wednesdays 17:15 UTC
  run: async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const weekDate = getMostRecentWednesday();
    const weekDateISO = formatAsISO(weekDate);

    logger.info("Starting regional bestseller population", {
      weekDate: weekDateISO,
      regionCount: REGIONS.length,
    });

    // --- Phase 1: Fetch and upsert regional bestsellers ---

    const allBooks: RegionalBook[] = [];
    const successfulRegions: string[] = [];

    for (const region of REGIONS) {
      try {
        const books = await fetchRegionalList(region, weekDate);
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
    let insertedCount = 0;
    let errorCount = 0;

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

    let totalScores = 0;

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

    const result = {
      success: true,
      weekDate: weekDateISO,
      regionsProcessed: successfulRegions,
      totalBooksFetched: allBooks.length,
      insertedCount,
      errorCount,
      totalScoresCalculated: totalScores,
    };

    logger.info("Regional bestseller population complete", result);
    return result;
  },
});
