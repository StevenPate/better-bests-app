import { task, logger, wait } from "@trigger.dev/sdk";
import { REGION_SLUGS } from "./aba/maps";
import { ingestRegionWeek } from "./ingest-bestsellers";
import { recalcWeeks } from "./recalc";

/**
 * One-shot backfill of the weeks the source break left damaged:
 * - 2026-08-26 / 2026-08-19: missing entirely (ingestion stopped 08-12)
 * - 2026-06-24 / 2026-06-03: PNBA-only cache-capture repairs after the
 *   week-shift incident; the ABA archive has all 9 regions.
 * Ingestion is idempotent, so weeks already covered return "unchanged".
 */
export const GAP_WEEKS = [
  "2026-08-26",
  "2026-08-19",
  "2026-06-24",
  "2026-06-03",
];

export const backfillGaps = task({
  id: "aba-backfill-gaps",
  run: async (payload: { weeks?: string[] }) => {
    const weeks = payload.weeks ?? GAP_WEEKS;
    const results = [];

    for (const weekDate of weeks) {
      for (const { slug } of REGION_SLUGS) {
        const r = await ingestRegionWeek.triggerAndWait({ slug, weekDate });
        if (r.ok) results.push(r.output);
        else logger.error("Backfill failed", { slug, weekDate, error: r.error });
        // Be a good citizen toward Google.
        await wait.for({ seconds: 2 });
      }
    }

    // List rows without score rows leave Awards/year-end silently
    // inconsistent. recalcWeeks regenerates feeds only when a touched week
    // is the current publication week, so historical backfill cannot
    // overwrite the live feeds.
    const touched = [...new Set(
      results.filter((x) => x.status === "written").map((x) => x.weekDate)
    )];
    if (touched.length > 0) await recalcWeeks(touched);

    logger.info("Backfill complete", {
      weeks,
      touched,
      statuses: results.map((x) => `${x.slug} ${x.weekDate}: ${x.status}`),
    });
    return { weeks, touched, results };
  },
});
