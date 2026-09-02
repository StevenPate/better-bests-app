import { schedules, task, logger } from "@trigger.dev/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { REGION_SLUGS } from "./aba/maps";
import { fetchRegionWeek } from "./aba/client";
import { toDbRows, contentHash } from "./aba/persist";
import { publicationWednesday, priorWednesdays } from "./aba/dates";
import { recalcWeeks } from "./recalc";

function supabase(): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const cacheKeyFor = (dbRegion: string, weekDate: string) =>
  `aba_v2_${dbRegion}_${weekDate}`;

export type IngestStatus = "written" | "unchanged" | "unpublished" | "already_ingested";

/**
 * Ingest one region-week from the ABA v2 Google Sheet.
 *
 * skipIfIngested: return early (without any network fetch) when fetch_cache
 * already records a successful ingest for this region-week. The polling cron
 * uses this so that, once a week has landed, later ticks cost one DB read
 * instead of a workbook download. The recheck task and backfill omit it to
 * force a fresh fetch-and-compare.
 *
 * Persistence is replace-on-change: when the content hash differs, the
 * region-week's rows are deleted and re-inserted so stale rows cannot linger
 * and old-parser category labels cannot duplicate books.
 */
export const ingestRegionWeek = task({
  id: "ingest-region-week",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30_000 },
  run: async (payload: {
    slug: string;
    weekDate: string;
    skipIfIngested?: boolean;
    /** Excuse an unparseable Report Details date — 2026-03-25 glitch only. */
    allowUnparseableReportDate?: boolean;
  }) => {
    const { slug, weekDate, skipIfIngested } = payload;
    const db = supabase();
    const dbRegion = REGION_SLUGS.find((r) => r.slug === slug)?.db;
    if (!dbRegion) throw new Error(`Unknown region slug: ${slug}`);
    const key = cacheKeyFor(dbRegion, weekDate);

    if (skipIfIngested) {
      const { data: existing } = await db
        .from("fetch_cache")
        .select("cache_key")
        .eq("cache_key", key)
        .maybeSingle();
      if (existing) {
        return { status: "already_ingested" as IngestStatus, slug, weekDate, rows: 0 };
      }
    }

    const week = await fetchRegionWeek(slug, weekDate, {
      allowUnparseableReportDate: payload.allowUnparseableReportDate,
    });
    if (!week) {
      logger.info("Not published yet", { slug, weekDate });
      return { status: "unpublished" as IngestStatus, slug, weekDate, rows: 0 };
    }

    const hash = contentHash(week);
    const { data: cached } = await db
      .from("fetch_cache")
      .select("data")
      .eq("cache_key", key)
      .maybeSingle();

    if ((cached?.data as { hash?: string } | null)?.hash === hash) {
      logger.info("Unchanged, skipping write", { slug, weekDate });
      return { status: "unchanged" as IngestStatus, slug, weekDate, rows: 0 };
    }

    const rows = toDbRows(week);

    const { error: delError } = await db
      .from("regional_bestsellers")
      .delete()
      .eq("region", week.dbRegion)
      .eq("week_date", weekDate);
    if (delError) {
      throw new Error(`Delete failed for ${slug} ${weekDate}: ${delError.message}`);
    }

    const { error: insError } = await db.from("regional_bestsellers").insert(rows);
    if (insError) {
      // The week is now partially empty; do NOT record the hash, so the next
      // run re-fetches and repairs it. Trigger.dev retries handle transients.
      throw new Error(`Insert failed for ${slug} ${weekDate}: ${insError.message}`);
    }

    // Persist the resolved sheet id so history stays reachable even if the
    // abaorg.link shortener is ever retired.
    const { error: cacheError } = await db.from("fetch_cache").upsert(
      {
        cache_key: key,
        data: { hash, sheetId: week.sheetId, ingestedAt: new Date().toISOString() },
      },
      { onConflict: "cache_key" }
    );
    if (cacheError) {
      logger.warn("fetch_cache upsert failed (ingest itself succeeded)", {
        slug, weekDate, error: cacheError.message,
      });
    }

    logger.info("Ingested", { slug, weekDate, rows: rows.length });
    return { status: "written" as IngestStatus, slug, weekDate, rows: rows.length };
  },
});

/**
 * Wednesday polling cron: current week only, cheap once landed.
 *
 * ABA's publish time drifts, so we poll every 20 minutes across the window.
 * Before a region's sheet exists, a tick costs one shortlink resolve per
 * region (fetchRegionWeek returns null). After it lands, skipIfIngested makes
 * every later tick a single fetch_cache read per region.
 */
export const weeklyIngest = schedules.task({
  id: "aba-weekly-ingest",
  cron: { pattern: "*/20 8-16 * * 3", timezone: "America/Los_Angeles" },
  run: async () => {
    const weekDate = publicationWednesday();
    const results = [];

    for (const { slug } of REGION_SLUGS) {
      const r = await ingestRegionWeek.triggerAndWait({
        slug,
        weekDate,
        skipIfIngested: true,
      });
      if (r.ok) results.push(r.output);
      else logger.error("Region failed", { slug, weekDate, error: r.error });
    }

    const written = results.filter((x) => x.status === "written");
    if (written.length > 0) {
      await recalcWeeks([weekDate]);
    }

    logger.info("Weekly ingest tick complete", {
      weekDate,
      written: written.length,
      statuses: results.map((x) => `${x.slug}:${x.status}`),
    });
    return { weekDate, written: written.length };
  },
});

/**
 * Once-per-Wednesday recheck, after the publication window: force-refetch the
 * current week and the two prior weeks so a late ABA correction lands. This
 * is the only place old weeks are re-downloaded, so the rolling recheck costs
 * one pass per week, not one per tick.
 */
export const weeklyRecheck = schedules.task({
  id: "aba-weekly-recheck",
  cron: { pattern: "0 17 * * 3", timezone: "America/Los_Angeles" },
  run: async () => {
    const current = publicationWednesday();
    const weeks = [current, ...priorWednesdays(current, 2)];
    const touched: string[] = [];

    for (const weekDate of weeks) {
      for (const { slug } of REGION_SLUGS) {
        const r = await ingestRegionWeek.triggerAndWait({ slug, weekDate });
        if (r.ok && r.output.status === "written" && !touched.includes(weekDate)) {
          touched.push(weekDate);
        }
        if (!r.ok) {
          logger.error("Recheck failed", { slug, weekDate, error: r.error });
        }
      }
    }

    if (touched.length > 0) await recalcWeeks(touched);

    logger.info("Weekly recheck complete", { weeks, touched });
    return { weeks, touched };
  },
});
