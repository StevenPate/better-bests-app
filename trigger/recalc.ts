import { logger } from "@trigger.dev/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assembleFeedJson,
  type CurrentBook,
  type PreviousWeekBook,
} from "./feedGenerator";
import { generateElsewhereFeeds } from "./generate-elsewhere-feeds";
import { REGION_SLUGS } from "./aba/maps";
import { publicationWednesday } from "./ingest-bestsellers";

/**
 * Scoring + feed regeneration, lifted from populate-regional-bestsellers so
 * the old task can be deleted. Two deliberate changes from the original:
 *
 * 1. Feed inputs (previous rank, weeks on list) come from the ABA-supplied
 *    columns on the current week's rows — no previous-week query, no
 *    get_weeks_on_list_batch_regional RPC.
 * 2. Feeds regenerate ONLY for the current publication week. The bucket
 *    holds one feed per region (region/{code}.json); recalculating a
 *    historical week must never overwrite the live feed.
 *
 * The 52-week cleanup delete deliberately did NOT move here — backfill can
 * reach this helper, and a cleanup there could delete historical rows.
 */

export interface ScoreSourceRow {
  isbn: string;
  region: string;
  week_date: string;
  rank: number;
  category: string | null;
  last_week_rank: number | null;
  weeks_on_list: number | null;
}

/** Historical scoring formula — a year of weekly_scores depends on it. */
export function calculateScore(rank: number, listSize: number): number {
  if (rank < 1 || listSize < 1) return 0;
  return 100 * (1 - Math.log(rank) / Math.log(listSize + 1));
}

export function buildScores(rows: ScoreSourceRow[]) {
  const categoryListSizes: Record<string, number> = {};
  for (const r of rows) {
    const cat = r.category || "General";
    categoryListSizes[cat] = (categoryListSizes[cat] || 0) + 1;
  }
  return rows.map((r) => {
    const cat = r.category || "General";
    const listSize = categoryListSizes[cat];
    return {
      isbn: r.isbn,
      region: r.region,
      week_date: r.week_date,
      rank: r.rank,
      category: cat,
      list_size: listSize,
      points: calculateScore(r.rank, listSize),
    };
  });
}

/** Feed inputs from the ABA-supplied columns on the current week's rows. */
export function feedInputsFromRows(rows: ScoreSourceRow[]): {
  previousBooks: PreviousWeekBook[];
  weeksOnList: Record<string, number>;
} {
  return {
    previousBooks: rows
      .filter((r) => r.last_week_rank !== null)
      .map((r) => ({ isbn: r.isbn, rank: r.last_week_rank! })),
    weeksOnList: Object.fromEntries(
      rows
        .filter((r) => r.weeks_on_list !== null)
        .map((r) => [r.isbn, r.weeks_on_list!])
    ),
  };
}

function supabase(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Recompute weekly_scores for the given weeks and, when one of them is the
 * current publication week, regenerate the regional JSON feeds.
 *
 * Rows are queried per region (9 x ~135 rows) to stay far below PostgREST's
 * 1000-row default limit. weekly_scores is replaced per region-week
 * (delete + insert) for the same reason ingest is: upserts leave ghosts.
 */
export async function recalcWeeks(weekDates: string[]): Promise<void> {
  const db = supabase();
  const currentWeek = publicationWednesday();

  for (const weekDate of weekDates) {
    const failures: string[] = [];
    let regionsWithData = 0;

    for (const { db: regionCode } of REGION_SLUGS) {
      try {
        const { data: rows, error } = await db
          .from("regional_bestsellers")
          .select("isbn, region, week_date, rank, category, last_week_rank, weeks_on_list")
          .eq("week_date", weekDate)
          .eq("region", regionCode);
        if (error) throw new Error(`rows query: ${error.message}`);
        if (!rows || rows.length === 0) continue;
        regionsWithData++;

        const scores = buildScores(rows as ScoreSourceRow[]);

        const { error: delErr } = await db
          .from("weekly_scores")
          .delete()
          .eq("region", regionCode)
          .eq("week_date", weekDate);
        if (delErr) throw new Error(`scores delete: ${delErr.message}`);

        const { error: insErr } = await db.from("weekly_scores").insert(scores);
        if (insErr) throw new Error(`scores insert: ${insErr.message}`);

        logger.info("Scores recalculated", {
          region: regionCode,
          weekDate,
          count: scores.length,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.error("Score recalc failed", { region: regionCode, weekDate, error: message });
        failures.push(regionCode);
      }
    }

    if (regionsWithData > 0 && failures.length === regionsWithData) {
      throw new Error(`Score recalc failed for every region in ${weekDate}`);
    }
  }

  // Feeds: current publication week only.
  if (weekDates.includes(currentWeek)) {
    await regenerateFeeds(db, currentWeek);
  } else {
    logger.info("No feed regeneration — no touched week is the current one", {
      weekDates,
      currentWeek,
    });
  }
}

async function regenerateFeeds(db: SupabaseClient, weekDate: string): Promise<void> {
  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const region of REGION_SLUGS) {
    const regionCode = region.db;
    try {
      const { data: rows, error } = await db
        .from("regional_bestsellers")
        .select("isbn, title, author, publisher, rank, category, last_week_rank, weeks_on_list")
        .eq("week_date", weekDate)
        .eq("region", regionCode)
        .order("rank", { ascending: true });
      if (error) throw new Error(`current week query: ${error.message}`);
      if (!rows || rows.length === 0) {
        logger.info("Feed skipped — no rows", { region: regionCode, weekDate });
        continue;
      }

      const currentBooks: CurrentBook[] = rows;
      const { previousBooks, weeksOnList } = feedInputsFromRows(
        rows as unknown as ScoreSourceRow[]
      );

      // Descriptions from fetch_cache (batched, single query per region)
      const cacheKeys = rows.map((r) => `google_books_info_${r.isbn}`);
      const { data: cacheRows, error: cacheErr } = await db
        .from("fetch_cache")
        .select("cache_key, data")
        .in("cache_key", cacheKeys);
      if (cacheErr) throw new Error(`fetch_cache query: ${cacheErr.message}`);
      const descriptions: Record<string, string> = {};
      for (const row of (cacheRows ?? []) as Array<{
        cache_key: string;
        data: { description?: string } | null;
      }>) {
        const isbn = row.cache_key.replace("google_books_info_", "");
        if (typeof row.data?.description === "string") {
          descriptions[isbn] = row.data.description;
        }
      }

      const feed = assembleFeedJson({
        region: { abbreviation: regionCode, full_name: region.full_name },
        weekDate: new Date(`${weekDate}T00:00:00Z`),
        currentBooks,
        previousBooks,
        weeksOnList,
        descriptions,
      });

      const buffer = new TextEncoder().encode(JSON.stringify(feed));
      const { error: uploadErr } = await db.storage
        .from("feeds")
        .upload(`region/${regionCode}.json`, buffer, {
          upsert: true,
          contentType: "application/json",
          cacheControl: "604800",
        });
      if (uploadErr) throw new Error(`upload: ${uploadErr.message}`);

      logger.info("Feed generated", {
        region: regionCode,
        bytes: buffer.byteLength,
        sections: feed.sections.length,
      });
      succeeded.push(regionCode);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error("Feed generation failed", { region: regionCode, error: message });
      failed.push(regionCode);
    }
  }

  if (succeeded.length === 0 && failed.length > 0) {
    throw new Error(`All ${failed.length} regions failed feed generation`);
  }

  await generateElsewhereFeeds.trigger();
  logger.info("Triggered elsewhere feed generation", { succeeded, failed });
}
