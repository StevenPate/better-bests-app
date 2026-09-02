import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWorkbook } from "./workbook";
import { rowsFromCells } from "./rows";

const tabs = parseWorkbook(
  new Uint8Array(
    readFileSync(join(__dirname, "../__fixtures__/aba-v2/pnba-2026-08-26.xlsx"))
  )
);

describe("rowsFromCells", () => {
  it("parses the real PNBA hardcover fiction tab", () => {
    const rows = rowsFromCells(tabs.get("Hardcover Fiction")!);
    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(rows[0]).toMatchObject({
      rank: 1,
      isbn: "9780063511637",
      title: "Whistler",
      author: "Ann Patchett",
      publisher: "Harper",
      price: "$30.00",
      last_week_rank: 2,
      weeks_on_list: 12,
    });
  });

  it("formats every ISBN as a 13-digit string despite float storage", () => {
    for (const [tab, cells] of tabs) {
      if (tab === "Childrens Series" || tab === "Report Details") continue;
      for (const row of rowsFromCells(cells)) {
        expect(row.isbn).toMatch(/^97[89]\d{10}$/);
      }
    }
  });

  it("renders prices as dollar strings matching the DB's stored format", () => {
    const rows = rowsFromCells(tabs.get("Mass Market Paperback")!);
    expect(rows[0].price).toMatch(/^\$\d+\.\d{2}$/);
  });

  it("maps a blank Last Week to null, not zero", () => {
    const cells = [
      ["Rank", "ISBN", "Title", "Author", "Publisher", "Price", "Last Week", "Weeks on List"],
      ["1.0", "9.78059379843E12", "T", "A", "P", "28.0", "", "1.0"],
    ];
    expect(rowsFromCells(cells)[0].last_week_rank).toBeNull();
  });

  it("maps a truncated-trailing-blank row correctly (Weeks on List missing)", () => {
    const cells = [
      ["Rank", "ISBN", "Title", "Author", "Publisher", "Price", "Last Week", "Weeks on List"],
      ["1.0", "9.78059379843E12", "T", "A", "P", "28.0", "3.0"],
    ];
    const row = rowsFromCells(cells)[0];
    expect(row.last_week_rank).toBe(3);
    expect(row.weeks_on_list).toBeNull();
  });

  it("drops rows whose ISBN is not a valid ISBN-13", () => {
    const cells = [
      ["Rank", "ISBN", "Title", "Author", "Publisher", "Price", "Last Week", "Weeks on List"],
      ["1.0", "12345.0", "Bad", "A", "P", "1.0", "1.0", "1.0"],
      ["2.0", "9.78059379843E12", "Good", "A", "P", "1.0", "1.0", "1.0"],
    ];
    const rows = rowsFromCells(cells);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Good");
  });

  it("recovers purely-numeric titles that Google stored as number cells", () => {
    // "1984" is a real Mass Market #1; its cell arrives as "1984.0".
    const cells = [
      ["Rank", "ISBN", "Title", "Author", "Publisher", "Price", "Last Week", "Weeks on List"],
      ["1.0", "9.780451524935E12", "1984.0", "George Orwell", "Signet", "12.0", "1.0", "588.0"],
    ];
    expect(rowsFromCells(cells)[0].title).toBe("1984");
  });

  it("tolerates a blank Rank header cell (MIBA 2026-08-19 glitch)", () => {
    // One real workbook shipped Paperback Fiction with an unlabeled first
    // column; the rank values themselves were present.
    const cells = [
      ["", "ISBN", "Title", "Author", "Publisher", "Price", "Last Week", "Weeks on List"],
      ["1.0", "9.78059379843E12", "T", "A", "P", "28.0", "3.0", "5.0"],
    ];
    const rows = rowsFromCells(cells);
    expect(rows).toHaveLength(1);
    expect(rows[0].rank).toBe(1);
  });

  it("throws when the expected columns are missing", () => {
    expect(() =>
      rowsFromCells([
        ["Rank", "", "Series", "Author", "Publisher"],
        ["1.0", "", "X", "Y", "Z"],
      ])
    ).toThrow(/missing required column/i);
  });

  it("caps at the published rank 15 — sheets carry top-50 internal lists", () => {
    // Scoring history and the UI are built on 15-deep lists; deeper rows
    // would silently rescale calculateScore's listSize.
    const hf = rowsFromCells(tabs.get("Hardcover Fiction")!);
    expect(Math.max(...hf.map((r) => r.rank))).toBeLessThanOrEqual(15);
    expect(hf.length).toBe(15);
  });

  it("preserves ABA's weeks-on-list beyond our DB history", () => {
    // Braiding Sweetgrass shows 400+ weeks — proof the value is ABA's count.
    const pbnf = rowsFromCells(tabs.get("Paperback Nonfiction")!);
    const braiding = pbnf.find((r) => r.isbn === "9781571313560");
    expect(braiding).toBeDefined();
    expect(braiding!.weeks_on_list).toBeGreaterThan(300);
  });
});
