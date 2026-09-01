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
