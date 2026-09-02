import { describe, it, expect } from "vitest";
import { contentHash, toDbRows } from "./persist";
import type { RegionWeek } from "./client";

function week(overrides: Partial<RegionWeek> = {}): RegionWeek {
  return {
    slug: "pnba",
    dbRegion: "PNBA",
    weekDate: "2026-08-26",
    sheetId: "X",
    byCategory: new Map([
      [
        "HARDCOVER FICTION",
        [
          {
            rank: 1,
            isbn: "9780063511637",
            title: "Whistler",
            author: "Ann Patchett",
            publisher: "Harper",
            price: "$30.00",
            last_week_rank: 2,
            weeks_on_list: 12,
          },
        ],
      ],
    ]),
    ...overrides,
  };
}

describe("toDbRows", () => {
  it("flattens categories into regional_bestsellers rows", () => {
    expect(toDbRows(week())).toEqual([
      {
        region: "PNBA",
        week_date: "2026-08-26",
        category: "HARDCOVER FICTION",
        rank: 1,
        isbn: "9780063511637",
        title: "Whistler",
        author: "Ann Patchett",
        publisher: "Harper",
        price: "$30.00",
        last_week_rank: 2,
        weeks_on_list: 12,
        list_title: "PNBA Independent Bestsellers",
      },
    ]);
  });
});

describe("toDbRows multi-list membership", () => {
  // ABA lists the same book on several lists (Rowley Jefferson: EMG #1,
  // Children's Titles #3, Children's Interest #1) and every list must
  // display complete. Storage keeps ALL memberships; scoring dedupes
  // separately (see recalc.test.ts) so each book still earns one score.
  const book = (isbn: string, rank: number) => ({
    rank, isbn, title: "T", author: "A", publisher: null, price: null,
    last_week_rank: null, weeks_on_list: null,
  });

  it("keeps every list membership for a cross-listed book", () => {
    const w = week();
    w.byCategory.set("EARLY & MIDDLE GRADE READERS", [book("9781419788109", 1)]);
    w.byCategory.set("CHILDREN'S TITLES", [book("9781419788109", 3)]);
    const rows = toDbRows(w).filter((r) => r.isbn === "9781419788109");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => `${r.category}#${r.rank}`).sort()).toEqual([
      "CHILDREN'S TITLES#3",
      "EARLY & MIDDLE GRADE READERS#1",
    ]);
  });
});

describe("contentHash", () => {
  it("is stable for identical content", () => {
    expect(contentHash(week())).toBe(contentHash(week()));
  });

  it("changes when a rank changes", () => {
    const changed = week();
    changed.byCategory.get("HARDCOVER FICTION")![0].rank = 2;
    expect(contentHash(changed)).not.toBe(contentHash(week()));
  });

  it("changes when last_week_rank changes", () => {
    const changed = week();
    changed.byCategory.get("HARDCOVER FICTION")![0].last_week_rank = 5;
    expect(contentHash(changed)).not.toBe(contentHash(week()));
  });

  it("ignores the sheet id, which changes every week by design", () => {
    expect(contentHash(week({ sheetId: "DIFFERENT" }))).toBe(contentHash(week()));
  });

  it("is order-independent across categories", () => {
    const a = week();
    a.byCategory.set("YOUNG ADULT", [
      { rank: 1, isbn: "9781665982412", title: "Perks", author: "C", publisher: null, price: null, last_week_rank: null, weeks_on_list: null },
    ]);
    const b = week();
    const entries = [...a.byCategory.entries()].reverse();
    b.byCategory = new Map(entries);
    expect(contentHash(a)).toBe(contentHash(b));
  });
});
