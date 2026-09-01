import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseWorkbook } from "./workbook";
import { parseReportDetails, assertReportMatches } from "./reportDetails";

const tabs = parseWorkbook(
  new Uint8Array(
    readFileSync(join(__dirname, "../__fixtures__/aba-v2/pnba-2026-08-26.xlsx"))
  )
);
const fixtureCells = tabs.get("Report Details")!;

describe("parseReportDetails", () => {
  it("reads the region label and week date from the real fixture", () => {
    expect(parseReportDetails(fixtureCells)).toEqual({
      label: "PNBA Bestsellers",
      weekDate: "2026-08-26",
    });
  });

  it("decodes an Excel serial in float text", () => {
    expect(
      parseReportDetails([["SIBA Bestsellers"], ["46106.0"]]).weekDate
    ).toBe("2026-03-25");
  });

  it("also accepts MM/DD/YYYY text", () => {
    expect(
      parseReportDetails([["SIBA Bestsellers"], ["03/25/2026"]]).weekDate
    ).toBe("2026-03-25");
  });

  it("throws on an unparseable date", () => {
    expect(() => parseReportDetails([["X"], ["someday"]])).toThrow(
      /unparseable date/i
    );
  });
});

describe("assertReportMatches", () => {
  it("passes when region and date agree", () => {
    expect(() =>
      assertReportMatches(fixtureCells, "PNBA", "2026-08-26")
    ).not.toThrow();
  });

  it("throws when the sheet is for a different week", () => {
    expect(() => assertReportMatches(fixtureCells, "PNBA", "2026-08-19")).toThrow(
      /week date mismatch/i
    );
  });

  it("throws when the sheet is for a different region", () => {
    expect(() => assertReportMatches(fixtureCells, "SIBA", "2026-08-26")).toThrow(
      /region mismatch/i
    );
  });

  // Our DB codes for California differ from ABA's slugs; the label carries
  // ABA's name. Verified live: every label is "{SLUG} Bestsellers".
  it("accepts NCIBA/SCIBA labels for the legacy California DB codes", () => {
    expect(() =>
      assertReportMatches(
        [["NCIBA Bestsellers"], ["46260.0"]],
        "CALIBAN",
        "2026-08-26"
      )
    ).not.toThrow();
    expect(() =>
      assertReportMatches(
        [["SCIBA Bestsellers"], ["46260.0"]],
        "CALIBAS",
        "2026-08-26"
      )
    ).not.toThrow();
  });
});
