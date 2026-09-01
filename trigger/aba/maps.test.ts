import { describe, it, expect } from "vitest";
import { REGION_SLUGS, dbRegionForSlug, dbCategoryForTab, SKIP } from "./maps";

describe("region maps", () => {
  it("covers all nine regions", () => {
    expect(REGION_SLUGS).toHaveLength(9);
  });

  it("maps ABA's new California slugs onto our legacy codes", () => {
    expect(dbRegionForSlug("nciba")).toBe("CALIBAN");
    expect(dbRegionForSlug("sciba")).toBe("CALIBAS");
  });

  it("maps unchanged regions straight through", () => {
    expect(dbRegionForSlug("pnba")).toBe("PNBA");
  });

  it("returns null for an unknown slug", () => {
    expect(dbRegionForSlug("national")).toBeNull();
  });
});

describe("category maps", () => {
  it("maps tab names to DB categories", () => {
    expect(dbCategoryForTab("Hardcover Fiction")).toBe("HARDCOVER FICTION");
    expect(dbCategoryForTab("Paperback Fiction")).toBe("TRADE PAPERBACK FICTION");
    expect(dbCategoryForTab("Early and Middle Grade")).toBe(
      "EARLY & MIDDLE GRADE READERS"
    );
  });

  // ABA ships this tab with a capital I in "TItles". Tolerate it, and
  // tolerate them fixing it later.
  it("is case and whitespace insensitive", () => {
    expect(dbCategoryForTab("Childrens Series TItles")).toBe(
      "CHILDREN'S SERIES TITLES"
    );
    expect(dbCategoryForTab("Childrens Series Titles")).toBe(
      "CHILDREN'S SERIES TITLES"
    );
    expect(dbCategoryForTab("  childrens   series titles  ")).toBe(
      "CHILDREN'S SERIES TITLES"
    );
  });

  it("returns SKIP for the series-level tab, which has no ISBN column", () => {
    expect(dbCategoryForTab("Childrens Series")).toBe(SKIP);
  });

  it("returns SKIP for the validation tab", () => {
    expect(dbCategoryForTab("Report Details")).toBe(SKIP);
  });

  // This is the guard against silent category drift.
  it("returns null for an unknown tab so the caller can fail loudly", () => {
    expect(dbCategoryForTab("Graphic Novels")).toBeNull();
  });
});
