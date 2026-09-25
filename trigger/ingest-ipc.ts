import { schedules, task, logger } from "@trigger.dev/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicationWednesday } from "./aba/dates";
import { parseIpcCsv } from "./ipc/csv";
import { listArchiveWeeks, fetchWeekCsvs } from "./ipc/drive";
import { toIpcDbRows, ipcContentHash, applyMomentum, IPC_REGION } from "./ipc/persist";

function supabase(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const cacheKeyFor = (weekDate: string) => `ipc_${weekDate}`;

export type IpcIngestStatus = "written" | "unchanged" | "unpublished" | "already_ingested";

/**
 * Ingest one IPC week from the public Drive archive.
 * Same replace-on-change + fetch_cache hash pattern as ingest-region-week.
 *
 * IPC is NEVER written to weekly_scores: recalc.ts iterates the 9 ABA
 * REGION_SLUGS only, so review aggregates and feeds are untouched. That does
 * NOT cover the readers of regional_bestsellers — see src/config/abaRegions.ts
 * and the four queries it fences.
 */
export const ingestIpcWeek = task({
  id: "ingest-ipc-week",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30_000 },
  run: async (payload: { weekDate: string; skipIfIngested?: boolean }) => {
    const { weekDate, skipIfIngested } = payload;
    const db = supabase();
    const key = cacheKeyFor(weekDate);

    if (skipIfIngested) {
      const { data: existing } = await db
        .from("fetch_cache").select("cache_key").eq("cache_key", key).maybeSingle();
      if (existing) return { status: "already_ingested" as IpcIngestStatus, weekDate, rows: 0 };
    }

    const weeks = await listArchiveWeeks();
    const folder = weeks.find((w) => w.weekDate === weekDate);
    if (!folder) {
      logger.info("IPC week not in archive yet", { weekDate });
      return { status: "unpublished" as IpcIngestStatus, weekDate, rows: 0 };
    }
    // listArchiveWeeks already resolved CSV availability, so skip the second
    // folder listing for the known CSV-less weeks (1-15-26, 1-22-26, 7-2-26)
    // and any future one.
    if (!folder.hasCsvs) {
      logger.info("IPC folder exists but has no CSVs", { weekDate, folder: folder.name });
      return { status: "unpublished" as IpcIngestStatus, weekDate, rows: 0 };
    }
    const csvs = await fetchWeekCsvs(folder.id);
    if (!csvs) {
      // Raced with a folder edit between listing and fetch. Not an error.
      logger.info("IPC CSVs vanished between listing and fetch", { weekDate, folder: folder.name });
      return { status: "unpublished" as IpcIngestStatus, weekDate, rows: 0 };
    }

    const rows = toIpcDbRows(weekDate, parseIpcCsv(csvs.fiction), parseIpcCsv(csvs.nonfiction));
    const hash = ipcContentHash(rows);

    const { data: cached } = await db
      .from("fetch_cache").select("data").eq("cache_key", key).maybeSingle();
    if ((cached?.data as { hash?: string } | null)?.hash === hash) {
      return { status: "unchanged" as IpcIngestStatus, weekDate, rows: 0 };
    }

    // Delete BEFORE computing weeks_on_list so the RPC count excludes this week.
    const { error: delError } = await db
      .from("regional_bestsellers").delete()
      .eq("region", IPC_REGION).eq("week_date", weekDate);
    if (delError) throw new Error(`IPC delete failed for ${weekDate}: ${delError.message}`);

    const prevWeek = new Date(`${weekDate}T00:00:00Z`);
    prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
    const prevWeekDate = prevWeek.toISOString().slice(0, 10);
    const { data: prevRows, error: prevError } = await db
      .from("regional_bestsellers").select("isbn, category, rank")
      .eq("region", IPC_REGION).eq("week_date", prevWeekDate);
    if (prevError) throw new Error(`IPC prev-week query failed: ${prevError.message}`);

    // NOTE: this RPC counts every stored week for the ISBN, with no date
    // bound, so it is only correct while `weekDate` is the newest IPC week in
    // the table. See applyMomentum in ./ipc/persist for why that makes
    // out-of-order ingest a correctness problem rather than a tidiness one.
    const isbns = [...new Set(rows.map((r) => r.isbn))];
    const { data: counts, error: rpcError } = await db.rpc(
      "get_weeks_on_list_batch_regional",
      { isbn_list: isbns, target_region: IPC_REGION }
    );
    if (rpcError) throw new Error(`IPC weeks-on-list RPC failed: ${rpcError.message}`);
    const historyCounts = new Map<string, number>(
      (counts ?? []).map((c: { isbn: string; weeks_on_list: number }) => [c.isbn, c.weeks_on_list])
    );

    applyMomentum(rows, prevRows ?? [], historyCounts);

    const { error: insError } = await db.from("regional_bestsellers").insert(rows);
    if (insError) {
      // Week is now empty; hash NOT recorded, so the next run repairs it.
      throw new Error(`IPC insert failed for ${weekDate}: ${insError.message}`);
    }

    const { error: cacheError } = await db.from("fetch_cache").upsert(
      { cache_key: key, data: { hash, folderId: folder.id, ingestedAt: new Date().toISOString() } },
      { onConflict: "cache_key" }
    );
    if (cacheError) {
      logger.warn("IPC fetch_cache upsert failed (ingest succeeded)", { weekDate, error: cacheError.message });
    }

    logger.info("IPC ingested", { weekDate, rows: rows.length });
    return { status: "written" as IpcIngestStatus, weekDate, rows: rows.length };
  },
});

/**
 * Thursday polling cron (PT). The IPC email arrives Wednesday under a
 * Thursday embargo; the Drive archive folder usually exists by Wednesday.
 * Polling Thursday morning respects the embargo. skipIfIngested makes
 * post-landing ticks one fetch_cache read.
 */
export const ipcWeeklyIngest = schedules.task({
  id: "ipc-weekly-ingest",
  cron: { pattern: "0,30 6-11 * * 4", timezone: "America/Los_Angeles" },
  run: async () => {
    const weekDate = publicationWednesday();
    const r = await ingestIpcWeek.triggerAndWait({ weekDate, skipIfIngested: true });
    if (!r.ok) {
      logger.error("IPC weekly ingest failed", { weekDate, error: r.error });
      return { weekDate, status: "failed" };
    }
    logger.info("IPC weekly tick", { weekDate, status: r.output.status });
    return { weekDate, status: r.output.status };
  },
});

/**
 * One-shot backfill: every archive week with CSVs, oldest first so
 * last_week_rank / weeks_on_list build up correctly. Weeks already ingested
 * are skipped via skipIfIngested. Trigger manually from the dashboard.
 */
export const ipcBackfill = task({
  id: "ipc-backfill",
  run: async () => {
    // Deduped by listArchiveWeeks, so weekDate is unique and this sort is
    // unambiguous. Oldest first so last_week_rank / weeks_on_list build up.
    const weeks = (await listArchiveWeeks())
      .filter((w) => w.hasCsvs)
      .sort((a, b) => a.weekDate.localeCompare(b.weekDate));
    const results: Array<{ weekDate: string; status: string }> = [];
    for (const w of weeks) {
      const r = await ingestIpcWeek.triggerAndWait({ weekDate: w.weekDate, skipIfIngested: true });
      results.push({ weekDate: w.weekDate, status: r.ok ? r.output.status : "failed" });
    }
    logger.info("IPC backfill complete", { results });
    return { results };
  },
});
