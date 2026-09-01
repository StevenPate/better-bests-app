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
 * regional_bestsellers enforces UNIQUE (region, isbn, week_date): one row per
 * book per region-week — the model every downstream consumer (scoring without
 * double-counting, book detail, heat maps) assumes. ABA lists the same book
 * on several lists, so when flattening we keep the most specific one. The
 * old pipeline resolved this accidentally (last upsert won); this order is
 * deliberate: CHILDREN'S INTEREST is a composite roll-up of the other
 * children's lists and comes last, contributing only books that appear
 * nowhere else.
 */
const CATEGORY_PRIORITY = [
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

function priorityOf(category: string): number {
  const i = CATEGORY_PRIORITY.indexOf(category);
  return i === -1 ? CATEGORY_PRIORITY.length : i;
}

export function toDbRows(week: RegionWeek): DbRow[] {
  const rows: DbRow[] = [];
  const seen = new Map<string, number>(); // isbn -> index in rows
  const orderedCategories = [...week.byCategory.entries()].sort(
    (a, b) => priorityOf(a[0]) - priorityOf(b[0])
  );
  for (const [category, books] of orderedCategories) {
    for (const b of books) {
      if (seen.has(b.isbn)) continue; // a more specific list already has it
      seen.set(b.isbn, rows.length);
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
