import { describe, it, expect } from "vitest";
import {
  parseFolderListing,
  parseFileListing,
  weekDateForFolderName,
  dedupeWeeks,
  findCsvIds,
} from "./drive";

// Trimmed copy of real embeddedfolderview markup (verified 2026-09-24).
const FOLDER_HTML = `
<div class="flip-entry" id="entry-12xDWh9eXrHXblvZLL7x0YMROrZhjF-XH">
<a href="https://drive.google.com/drive/folders/12xDWh9eXrHXblvZLL7x0YMROrZhjF-XH" target="_blank">
<div class="flip-entry-info"><span class="flip-entry-title">1-15-26</span></div></a></div>
<div class="flip-entry" id="entry-182A0ksJb010nWwB6yVEsMtL4QkjBwOLf">
<a href="https://drive.google.com/drive/folders/182A0ksJb010nWwB6yVEsMtL4QkjBwOLf" target="_blank">
<div class="flip-entry-info"><span class="flip-entry-title">9-3-26</span></div></a></div>`;

const FILE_HTML = `
<div class="flip-entry" id="entry-1CPUSWJf_lYyL3zDTov9hp1hfOwWAYlqP">
<a href="https://drive.google.com/file/d/1CPUSWJf_lYyL3zDTov9hp1hfOwWAYlqP/view" target="_blank">
<div class="flip-entry-info"><span class="flip-entry-title">independentpresstop40fiction.csv</span></div></a></div>
<div class="flip-entry" id="entry-1E9LZg8Vc0V3E8wKoBnyyuO7vxOH1sO8Q">
<a href="https://drive.google.com/file/d/1E9LZg8Vc0V3E8wKoBnyyuO7vxOH1sO8Q/view" target="_blank">
<div class="flip-entry-info"><span class="flip-entry-title">independentpresstop40fiction.pdf</span></div></a></div>`;

describe("parseFolderListing", () => {
  it("extracts folder id/name pairs", () => {
    expect(parseFolderListing(FOLDER_HTML)).toEqual([
      { id: "12xDWh9eXrHXblvZLL7x0YMROrZhjF-XH", name: "1-15-26" },
      { id: "182A0ksJb010nWwB6yVEsMtL4QkjBwOLf", name: "9-3-26" },
    ]);
  });
});

describe("parseFileListing", () => {
  it("extracts file id/name pairs", () => {
    const files = parseFileListing(FILE_HTML);
    expect(files).toContainEqual({
      id: "1CPUSWJf_lYyL3zDTov9hp1hfOwWAYlqP",
      name: "independentpresstop40fiction.csv",
    });
    expect(files).toHaveLength(2);
  });
});

describe("weekDateForFolderName", () => {
  it("maps a publication-Thursday folder to the ABA Wednesday of the same sales week", () => {
    expect(weekDateForFolderName("9-3-26")).toBe("2026-09-02");
  });
  it("maps a drifted (non-Thursday) folder name to the most recent Wednesday before it", () => {
    // 2026-02-15 is a Sunday (real folder); Wednesday of that publication week is 2-11.
    expect(weekDateForFolderName("2-15-26")).toBe("2026-02-11");
  });
  it("returns null for non-date folder names", () => {
    expect(weekDateForFolderName("Marketing Assets")).toBeNull();
  });

  it("maps 2-12-26 and 2-15-26 to the same week — the real collision", () => {
    // Both resolve to 2026-02-11. dedupeWeeks below decides which one wins.
    expect(weekDateForFolderName("2-12-26")).toBe("2026-02-11");
    expect(weekDateForFolderName("2-15-26")).toBe("2026-02-11");
  });
});

describe("dedupeWeeks", () => {
  const w = (name: string, weekDate: string, hasCsvs: boolean) =>
    ({ id: `id-${name}`, name, weekDate, hasCsvs });

  it("keeps the CSV-bearing folder when two folders claim one week", () => {
    const kept = dedupeWeeks([
      w("2-12-26", "2026-02-11", false),
      w("2-15-26", "2026-02-11", true),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("2-15-26");
  });

  it("is order-independent", () => {
    const kept = dedupeWeeks([
      w("2-15-26", "2026-02-11", true),
      w("2-12-26", "2026-02-11", false),
    ]);
    expect(kept[0].name).toBe("2-15-26");
  });

  it("breaks an all-equal tie by latest folder name, deterministically", () => {
    const kept = dedupeWeeks([
      w("2-12-26", "2026-02-11", true),
      w("2-15-26", "2026-02-11", true),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].name).toBe("2-15-26");
  });

  it("leaves non-colliding weeks alone", () => {
    const kept = dedupeWeeks([
      w("9-3-26", "2026-09-02", true),
      w("9-10-26", "2026-09-09", true),
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe("findCsvIds", () => {
  const entry = (name: string) => ({ id: `id:${name}`, name });

  it("finds the canonically named pair", () => {
    expect(
      findCsvIds([
        entry("independentpresstop40fiction.csv"),
        entry("independentpresstop40nonfiction.csv"),
        entry("independentpresstop40fiction.pdf"),
      ])
    ).toEqual({
      fiction: "id:independentpresstop40fiction.csv",
      nonfiction: "id:independentpresstop40nonfiction.csv",
    });
  });

  // Real folder 7-9-26: someone re-exported from Google Sheets, so the files
  // carry a " - Sheet1" suffix and a " (2)" dedup counter. Exact-name matching
  // silently dropped this week from the archive.
  it("finds CSVs exported from Sheets with suffixed names", () => {
    expect(
      findCsvIds([
        entry("independentpresstop40fiction - Sheet1 (2).csv"),
        entry("independentpresstop40nonfiction - Sheet1 (2).csv"),
        entry("independentpresstop40fiction (3).pdf"),
      ])
    ).toEqual({
      fiction: "id:independentpresstop40fiction - Sheet1 (2).csv",
      nonfiction: "id:independentpresstop40nonfiction - Sheet1 (2).csv",
    });
  });

  it("never mistakes a nonfiction file for a fiction one", () => {
    const found = findCsvIds([
      entry("independentpresstop40nonfiction.csv"),
      entry("independentpresstop40nonfiction - Sheet1.csv"),
    ]);
    expect(found).toBeNull(); // no fiction CSV present
  });

  it("prefers the canonical name when both it and a suffixed variant exist", () => {
    expect(
      findCsvIds([
        entry("independentpresstop40fiction - Sheet1 (2).csv"),
        entry("independentpresstop40fiction.csv"),
        entry("independentpresstop40nonfiction.csv"),
      ])!.fiction
    ).toBe("id:independentpresstop40fiction.csv");
  });

  it("returns null when a category has no CSV at all", () => {
    expect(
      findCsvIds([
        entry("independentpresstop40fiction.pdf"),
        entry("independentpresstop40nonfiction.jpg"),
      ])
    ).toBeNull();
  });
});
