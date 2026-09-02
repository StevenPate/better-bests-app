import { task, logger, wait } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { REGION_SLUGS } from "./aba/maps";
import { fetchRegionWeek } from "./aba/client";

/** Every Wednesday from the archive start to the given end. */
export function archiveWeeks(from = "2026-03-25", to = "2026-08-26"): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

interface Discrepancy {
  weekDate: string;
  region: string;
  category: string;
  rank: number;
  stored: string | undefined;
  archive: string;
}

/**
 * READ-ONLY audit of stored history against the ABA archive. Writes nothing
 * to regional_bestsellers — it reports.
 *
 * Comparison is archive -> stored by (category, rank): a slot present in
 * both with different ISBNs is a discrepancy. Slots the store lacks (e.g.
 * dedup holes, category drift) lower the matched count but are not flagged,
 * so "0 mismatches" does not mean the stored week is complete — read the
 * matched/archiveTotal ratio alongside it. A week mislabeled by the old
 * week-shift bug shows up as systematic mismatches across every category.
 */
export const auditHistory = task({
  id: "aba-audit-history",
  run: async (payload: { weeks?: string[] }) => {
    const db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const weeks = payload.weeks ?? archiveWeeks();
    const discrepancies: Discrepancy[] = [];
    const summary: Array<{
      weekDate: string; region: string;
      archiveTotal: number; matched: number; mismatched: number; storedTotal: number;
    }> = [];

    for (const weekDate of weeks) {
      for (const { slug, db: dbRegion } of REGION_SLUGS) {
        const week = await fetchRegionWeek(slug, weekDate).catch((e) => {
          logger.warn("Audit fetch failed", { slug, weekDate, error: String(e) });
          return null;
        });
        if (!week) continue;

        const { data: stored, error } = await db
          .from("regional_bestsellers")
          .select("category, rank, isbn")
          .eq("region", dbRegion)
          .eq("week_date", weekDate);
        if (error) {
          logger.error("Audit DB read failed", { dbRegion, weekDate, error: error.message });
          continue;
        }

        const storedByKey = new Map(
          (stored ?? []).map((r) => [`${r.category}|${r.rank}`, r.isbn as string])
        );

        let matched = 0;
        let mismatched = 0;
        let archiveTotal = 0;
        for (const [category, books] of week.byCategory) {
          for (const b of books) {
            archiveTotal++;
            const key = `${category}|${b.rank}`;
            if (!storedByKey.has(key)) continue;
            if (storedByKey.get(key) === b.isbn) matched++;
            else {
              mismatched++;
              discrepancies.push({
                weekDate, region: dbRegion, category, rank: b.rank,
                stored: storedByKey.get(key), archive: b.isbn,
              });
            }
          }
        }
        summary.push({
          weekDate, region: dbRegion,
          archiveTotal, matched, mismatched, storedTotal: (stored ?? []).length,
        });
        logger.info("Audited", { weekDate, dbRegion, archiveTotal, matched, mismatched });
        await wait.for({ seconds: 2 });
      }
    }

    logger.info("Audit complete", {
      weeks: weeks.length,
      discrepancyCount: discrepancies.length,
    });
    return { weeks, summary, discrepancyCount: discrepancies.length, discrepancies };
  },
});
