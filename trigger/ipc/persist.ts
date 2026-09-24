import { createHash } from "node:crypto";
import type { DbRow } from "../aba/persist";
import type { IpcBookRow } from "./csv";

export const IPC_REGION = "IPC";
export const IPC_LIST_TITLE = "Independent Press Top 40";

function catRows(weekDate: string, category: string, books: IpcBookRow[]): DbRow[] {
  return books.map((b) => ({
    region: IPC_REGION,
    week_date: weekDate,
    category,
    rank: b.rank,
    isbn: b.isbn,
    title: b.title,
    author: b.author,
    publisher: b.publisher,
    price: null,
    last_week_rank: null,
    weeks_on_list: null,
    list_title: IPC_LIST_TITLE,
  }));
}

export function toIpcDbRows(
  weekDate: string,
  fiction: IpcBookRow[],
  nonfiction: IpcBookRow[]
): DbRow[] {
  return [
    ...catRows(weekDate, "FICTION", fiction),
    ...catRows(weekDate, "NONFICTION", nonfiction),
  ];
}

/**
 * Hash of source content only. Momentum fields are derived from our own
 * stored history rather than the CSV, and they legitimately change when an
 * earlier week is backfilled — including them would make an unchanged list
 * look changed and trigger a pointless rewrite.
 */
export function ipcContentHash(rows: DbRow[]): string {
  const canonical = rows
    .map((r) => [r.category, r.rank, r.isbn, r.title, r.author, r.publisher].join(" "))
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Mutates rows in place. prevRows: the prior IPC week's (isbn, category, rank).
 * historyCounts: distinct prior weeks per ISBN from the
 * get_weeks_on_list_batch_regional RPC (computed while this week's rows are
 * deleted, so the count excludes the current week).
 *
 * Keyed by category as well as ISBN: a title can move between the Fiction and
 * Nonfiction lists, and its rank on one says nothing about the other.
 */
export function applyMomentum(
  rows: DbRow[],
  prevRows: Array<{ isbn: string; category: string | null; rank: number }>,
  historyCounts: Map<string, number>
): void {
  const prevRank = new Map(prevRows.map((r) => [`${r.category}|${r.isbn}`, r.rank]));
  for (const r of rows) {
    r.last_week_rank = prevRank.get(`${r.category}|${r.isbn}`) ?? null;
    r.weeks_on_list = (historyCounts.get(r.isbn) ?? 0) + 1;
  }
}
