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

  it("throws when the expected columns are missing", () => {
    expect(() =>
      rowsFromCells([
        ["Rank", "", "Series", "Author", "Publisher"],
        ["1.0", "", "X", "Y", "Z"],
      ])
    ).toThrow(/missing required column/i);
  });

  it("preserves ABA's weeks-on-list beyond our DB history", () => {
    // Braiding Sweetgrass shows 400+ weeks — proof the value is ABA's count.
    const pbnf = rowsFromCells(tabs.get("Paperback Nonfiction")!);
    const braiding = pbnf.find((r) => r.isbn === "9781571313560");
    expect(braiding).toBeDefined();
    expect(braiding!.weeks_on_list).toBeGreaterThan(300);
  });
});
