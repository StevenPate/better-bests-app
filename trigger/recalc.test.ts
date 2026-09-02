import { describe, it, expect } from "vitest";
import { calculateScore, buildScores, feedInputsFromRows, type ScoreSourceRow } from "./recalc";

const row = (o: Partial<ScoreSourceRow>): ScoreSourceRow => ({
  isbn: "9780000000000",
  region: "PNBA",
  week_date: "2026-08-26",
  rank: 1,
  category: "HARDCOVER FICTION",
  last_week_rank: null,
  weeks_on_list: null,
  ...o,
});

describe("calculateScore", () => {
  // Values must match the historical formula exactly — a year of
  // weekly_scores depends on it.
  it("gives rank 1 a score of 100 regardless of list size", () => {
    expect(calculateScore(1, 15)).toBe(100);
    expect(calculateScore(1, 10)).toBe(100);
  });

  it("matches the historical curve", () => {
    expect(calculateScore(2, 15)).toBeCloseTo(75.0, 1);
    expect(calculateScore(15, 15)).toBeCloseTo(2.328, 2);
  });

  it("returns 0 for invalid input", () => {
    expect(calculateScore(0, 15)).toBe(0);
    expect(calculateScore(1, 0)).toBe(0);
  });
});

describe("buildScores", () => {
  it("scores a cross-listed book exactly once, in its most specific list", () => {
    // Storage keeps all list memberships; scoring must not double-count.
    // CHILDREN'S INTEREST is a composite roll-up and always yields.
    const rows = [
      row({ isbn: "9781419788109", rank: 1, category: "EARLY & MIDDLE GRADE READERS" }),
      row({ isbn: "9781419788109", rank: 1, category: "CHILDREN'S INTEREST" }),
      row({ isbn: "9780000000001", rank: 2, category: "CHILDREN'S INTEREST" }),
    ];
    const scores = buildScores(rows);
    const rowley = scores.filter((s) => s.isbn === "9781419788109");
    expect(rowley).toHaveLength(1);
    expect(rowley[0].category).toBe("EARLY & MIDDLE GRADE READERS");
    // The composite-only book still scores, on the composite list.
    expect(scores.some((s) => s.isbn === "9780000000001" && s.category === "CHILDREN'S INTEREST")).toBe(true);
  });

  it("computes list_size from the deduped rows, matching historical scoring", () => {
    const rows = [
      row({ isbn: "1111111111111", rank: 1, category: "CHILDREN'S TITLES" }),
      row({ isbn: "1111111111111", rank: 4, category: "EARLY & MIDDLE GRADE READERS" }),
      row({ isbn: "2222222222222", rank: 5, category: "EARLY & MIDDLE GRADE READERS" }),
    ];
    const scores = buildScores(rows);
    const emg = scores.find((s) => s.category === "EARLY & MIDDLE GRADE READERS");
    // Only one book scores under EMG (the other deduped into CT), so its
    // list_size is 1 — same as when storage itself was deduped.
    expect(emg!.list_size).toBe(1);
  });
  it("computes list_size per category from the stored rows", () => {
    const rows = [
      row({ isbn: "1111111111111", rank: 1 }),
      row({ isbn: "2222222222222", rank: 2 }),
      row({ isbn: "3333333333333", rank: 1, category: "YOUNG ADULT" }),
    ];
    const scores = buildScores(rows);
    expect(scores).toHaveLength(3);
    const hf = scores.find((s) => s.isbn === "1111111111111")!;
    expect(hf.list_size).toBe(2);
    expect(hf.points).toBe(calculateScore(1, 2));
    const ya = scores.find((s) => s.isbn === "3333333333333")!;
    expect(ya.list_size).toBe(1);
  });

  it("defaults a null category to General", () => {
    const scores = buildScores([row({ category: null })]);
    expect(scores[0].category).toBe("General");
  });
});

describe("feedInputsFromRows", () => {
  it("derives previousBooks from last_week_rank, skipping new entries", () => {
    const rows = [
      row({ isbn: "1111111111111", last_week_rank: 3 }),
      row({ isbn: "2222222222222", last_week_rank: null }),
    ];
    expect(feedInputsFromRows(rows).previousBooks).toEqual([
      { isbn: "1111111111111", rank: 3, category: "HARDCOVER FICTION" },
    ]);
  });

  it("derives weeksOnList from the stored column, skipping nulls", () => {
    const rows = [
      row({ isbn: "1111111111111", weeks_on_list: 434 }),
      row({ isbn: "2222222222222", weeks_on_list: null }),
    ];
    expect(feedInputsFromRows(rows).weeksOnList).toEqual({
      "1111111111111": 434,
    });
  });
});
