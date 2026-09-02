import { createHash } from "node:crypto";
import type { RegionWeek } from "./client";

export interface DbRow {
  region: string;
  week_date: string;
  category: string;
  rank: number;
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  price: string | null;
  last_week_rank: number | null;
  weeks_on_list: number | null;
  list_title: string;
}

/**
 * Category specificity order, most specific first. CHILDREN'S INTEREST is a
 * composite roll-up of the other children's lists and always comes last.
 *
 * Storage keeps EVERY list membership (official lists must display complete
 * — a book can be EMG #1 and Children's Titles #3 simultaneously). This
 * order is used by SCORING (trigger/recalc.ts) to credit each book exactly
 * once per region-week, in its most specific list, preserving comparability
 * with the historical one-score-per-book model.
 */
export const CATEGORY_PRIORITY = [
  "HARDCOVER FICTION",
  "HARDCOVER NONFICTION",
  "TRADE PAPERBACK FICTION",
  "TRADE PAPERBACK NONFICTION",
  "MASS MARKET",
  "CHILDREN'S ILLUSTRATED",
  "CHILDREN'S TITLES",
  "CHILDREN'S SERIES TITLES",
  "EARLY & MIDDLE GRADE READERS",
  "YOUNG ADULT",
  "CHILDREN'S INTEREST", // composite — always last
];

export function priorityOf(category: string): number {
  const i = CATEGORY_PRIORITY.indexOf(category);
  return i === -1 ? CATEGORY_PRIORITY.length : i;
}

export function toDbRows(week: RegionWeek): DbRow[] {
  const rows: DbRow[] = [];
  for (const [category, books] of week.byCategory) {
    for (const b of books) {
      rows.push({
        region: week.dbRegion,
        week_date: week.weekDate,
        category,
        rank: b.rank,
        isbn: b.isbn,
        title: b.title,
        author: b.author,
        publisher: b.publisher,
        price: b.price,
        last_week_rank: b.last_week_rank,
        weeks_on_list: b.weeks_on_list,
        list_title: `${week.dbRegion} Independent Bestsellers`,
      });
    }
  }
  return rows;
}

/**
 * Hash of the meaningful content only. Deliberately excludes sheetId, which
 * is different every week even when the content is unchanged. Rows are
 * sorted so map iteration order cannot affect the hash.
 */
export function contentHash(week: RegionWeek): string {
  const canonical = toDbRows(week)
    .map((r) =>
      [
        r.category, r.rank, r.isbn, r.title, r.author,
        r.publisher ?? "", r.price ?? "",
        r.last_week_rank ?? "", r.weeks_on_list ?? "",
      ].join("|") // delimited so ("CAT",11) and ("CAT1",1) cannot collide
    )
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}
