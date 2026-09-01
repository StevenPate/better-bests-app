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

describe("toDbRows dedup", () => {
  // The DB enforces UNIQUE (region, isbn, week_date): one row per book per
  // region-week. ABA lists the same book on several lists, so we keep the
  // most specific one: CHILDREN'S INTEREST is a composite roll-up and only
  // contributes books that appear on no other list.
  const book = (isbn: string, rank: number) => ({
    rank, isbn, title: "T", author: "A", publisher: null, price: null,
    last_week_rank: null, weeks_on_list: null,
  });

  it("keeps the specific-list row when a book is also on Childrens Interest", () => {
    const w = week();
    w.byCategory.set("EARLY & MIDDLE GRADE READERS", [book("9780593809891", 3)]);
    w.byCategory.set("CHILDREN'S INTEREST", [
      book("9780593809891", 5),   // duplicate of the EMG book
      book("9781339028019", 10),  // only on the composite list
    ]);
    const rows = toDbRows(w);
    const kept = rows.filter((r) => r.isbn === "9780593809891");
    expect(kept).toHaveLength(1);
    expect(kept[0].category).toBe("EARLY & MIDDLE GRADE READERS");
    expect(kept[0].rank).toBe(3);
    // The composite-only book survives.
    expect(rows.some((r) => r.isbn === "9781339028019" && r.category === "CHILDREN'S INTEREST")).toBe(true);
  });

  it("is deterministic when a book is on two specific lists", () => {
    const w = week();
    w.byCategory.set("CHILDREN'S TITLES", [book("9781419788109", 1)]);
    w.byCategory.set("EARLY & MIDDLE GRADE READERS", [book("9781419788109", 1)]);
    const rows = toDbRows(w).filter((r) => r.isbn === "9781419788109");
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe("CHILDREN'S TITLES"); // priority order
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
