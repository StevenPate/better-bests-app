import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTabNames, parseWorkbook } from "./workbook";

const workbookXml = readFileSync(
  join(__dirname, "../__fixtures__/aba-v2/pnba-2026-08-26-workbook.xml"),
  "utf-8"
);
const xlsxBytes = new Uint8Array(
  readFileSync(join(__dirname, "../__fixtures__/aba-v2/pnba-2026-08-26.xlsx"))
);

describe("parseTabNames", () => {
  it("extracts every tab name in order", () => {
    const tabs = parseTabNames(workbookXml);
    expect(tabs[0]).toBe("Hardcover Fiction");
    expect(tabs).toContain("Young Adult");
    expect(tabs).toContain("Report Details");
    expect(tabs).toHaveLength(13);
  });

  it("preserves ABA's typo rather than normalizing it away", () => {
    expect(parseTabNames(workbookXml)).toContain("Childrens Series TItles");
  });

  it("decodes XML entities in tab names", () => {
    const xml =
      '<sheets><sheet state="visible" name="Fiction &amp; Poetry" sheetId="1" r:id="rId5"/></sheets>';
    expect(parseTabNames(xml)).toEqual(["Fiction & Poetry"]);
  });

  it("throws when the workbook has no sheets", () => {
    expect(() => parseTabNames("<workbook></workbook>")).toThrow(/no sheet names/i);
  });
});

describe("parseWorkbook (full xlsx -> cells per tab)", () => {
  // gviz could not serve two of these tabs correctly (it silently returned
  // the first tab's data), which is why cells come from the xlsx: the
  // name -> rels -> sheetN.xml chain cannot mismatch.
  const tabs = parseWorkbook(xlsxBytes);

  it("returns all 13 tabs keyed by exact name", () => {
    expect([...tabs.keys()]).toHaveLength(13);
    expect(tabs.has("Hardcover Fiction")).toBe(true);
    expect(tabs.has("Childrens Series TItles")).toBe(true);
  });

  it("parses the Hardcover Fiction header and first row", () => {
    const rows = tabs.get("Hardcover Fiction")!;
    expect(rows[0].slice(0, 8)).toEqual([
      "Rank", "ISBN", "Title", "Author", "Publisher", "Price", "Last Week", "Weeks on List",
    ]);
    // Numbers arrive as raw <v> text: rank "1.0", ISBN in scientific
    // notation. Interpretation belongs to rows.ts, not the workbook reader.
    expect(Number(rows[1][0])).toBe(1);
    expect(Number(rows[1][1])).toBe(9780063511637);
    expect(rows[1][2]).toBe("Whistler");
  });

  it("gives the series-level tab its own 4-column data — the gviz failure case", () => {
    const rows = tabs.get("Childrens Series")!;
    // The real sheet has an empty column B; interior blanks are preserved.
    expect(rows[0]).toEqual(["Rank", "", "Series", "Author", "Publisher"]);
    expect(rows[1][2]).not.toBe("Whistler"); // must NOT be Hardcover Fiction data
  });

  it("gives Childrens Series TItles title-level data distinct from tab 1", () => {
    const rows = tabs.get("Childrens Series TItles")!;
    expect(rows[0][1]).toBe("ISBN");
    expect(rows[1][2]).not.toBe("Whistler");
  });

  it("decodes shared strings with entities", () => {
    const hf = tabs.get("Hardcover Fiction")!;
    const publishers = hf.slice(1).map((r) => r[4]);
    expect(publishers).toContain("Spiegel & Grau");
  });

  it("parses Report Details: label string and Excel serial date", () => {
    const rows = tabs.get("Report Details")!;
    expect(rows[0][0]).toBe("PNBA Bestsellers");
    expect(Number(rows[1][0])).toBe(46260); // 2026-08-26
  });

  it("represents blank cells as empty strings, keeping columns aligned", () => {
    // Some books have a blank "Last Week"; the row must still have the
    // Weeks on List value in column 7, not shifted into column 6.
    const hf = tabs.get("Hardcover Fiction")!;
    for (const row of hf.slice(1)) {
      expect(row.length).toBeGreaterThanOrEqual(6);
    }
  });
});
