import { describe, it, expect } from "vitest";
import { toIpcDbRows, ipcContentHash, applyMomentum } from "./persist";
import type { IpcBookRow } from "./csv";

const book = (rank: number, isbn: string): IpcBookRow => ({
  rank, isbn, title: `T${rank}`, publisher: "P", author: "A",
});

describe("toIpcDbRows", () => {
  it("maps both categories to regional_bestsellers rows under region IPC", () => {
    const rows = toIpcDbRows("2026-09-02", [book(1, "9781000000001")], [book(1, "9781000000002")]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      region: "IPC", week_date: "2026-09-02", category: "FICTION",
      rank: 1, isbn: "9781000000001", price: null,
      last_week_rank: null, weeks_on_list: null,
      list_title: "Independent Press Top 40",
    });
    expect(rows[1].category).toBe("NONFICTION");
  });
});

describe("ipcContentHash", () => {
  it("is stable across calls and changes when content changes", () => {
    const a = toIpcDbRows("2026-09-02", [book(1, "9781000000001")], []);
    const b = toIpcDbRows("2026-09-02", [book(1, "9781000000009")], []);
    expect(ipcContentHash(a)).toBe(ipcContentHash(a));
    expect(ipcContentHash(a)).not.toBe(ipcContentHash(b));
  });

  // The hash gates the "unchanged, skip the write" path, so it must ignore
  // the momentum fields — those are derived from our own history, not from
  // the source CSV, and they change whenever an earlier week is backfilled.
  it("ignores momentum fields", () => {
    const rows = toIpcDbRows("2026-09-02", [book(1, "9781000000001")], []);
    const before = ipcContentHash(rows);
    applyMomentum(rows, [{ isbn: "9781000000001", category: "FICTION", rank: 4 }], new Map([["9781000000001", 7]]));
    expect(ipcContentHash(rows)).toBe(before);
  });

  it("changes when a rank changes but the same books are on the list", () => {
    const a = toIpcDbRows("2026-09-02", [book(1, "9781000000001"), book(2, "9781000000002")], []);
    const b = toIpcDbRows("2026-09-02", [book(2, "9781000000001"), book(1, "9781000000002")], []);
    expect(ipcContentHash(a)).not.toBe(ipcContentHash(b));
  });
});

describe("applyMomentum", () => {
  it("fills last_week_rank from the prior week and weeks_on_list from history counts", () => {
    const rows = toIpcDbRows("2026-09-02", [book(1, "9781000000001"), book(2, "9781000000002")], []);
    applyMomentum(
      rows,
      [{ isbn: "9781000000001", category: "FICTION", rank: 5 }],
      new Map([["9781000000001", 12]])
    );
    expect(rows[0]).toMatchObject({ last_week_rank: 5, weeks_on_list: 13 });
    // New book: no prior rank, first week on list.
    expect(rows[1]).toMatchObject({ last_week_rank: null, weeks_on_list: 1 });
  });

  // A book can chart on Fiction one week and Nonfiction the next (or sit on
  // both). last_week_rank must come from the SAME category, never the other.
  it("keys last_week_rank by category as well as ISBN", () => {
    const rows = toIpcDbRows("2026-09-02", [book(1, "9781000000001")], [book(1, "9781000000001")]);
    applyMomentum(
      rows,
      [{ isbn: "9781000000001", category: "NONFICTION", rank: 9 }],
      new Map()
    );
    expect(rows[0]).toMatchObject({ category: "FICTION", last_week_rank: null });
    expect(rows[1]).toMatchObject({ category: "NONFICTION", last_week_rank: 9 });
  });
});
