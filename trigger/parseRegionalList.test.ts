import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseRegionalList } from "./parseRegionalList";

const FIXTURE = readFileSync(
  path.join(__dirname, "__fixtures__/pnba-2026-06-24.txt"),
  "utf-8"
);

describe("parseRegionalList", () => {
  it("parses 110 books from the PNBA 2026-06-24 fixture", () => {
    const books = parseRegionalList(FIXTURE, "PNBA", "2026-06-24");
    expect(books.length).toBe(110);
  });

  it("assigns books with apostrophes in their category header to that category, not the previous one", () => {
    const books = parseRegionalList(FIXTURE, "PNBA", "2026-06-24");

    // 'Dad' by Christian Robinson is rank 1 in CHILDREN'S ILLUSTRATED — not MASS MARKET
    const dad = books.find((b) => b.isbn === "9781250397041");
    expect(dad?.category).toBe("CHILDREN'S ILLUSTRATED");

    // 'InvestiGators: Weather or Not' is rank 1 in CHILDREN'S SERIES TITLES — not YOUNG ADULT
    const investigators = books.find((b) => b.isbn === "9781250357915");
    expect(investigators?.category).toBe("CHILDREN'S SERIES TITLES");
  });

  it("assigns books under EARLY & MIDDLE GRADE READERS to that category, not the previous one", () => {
    const books = parseRegionalList(FIXTURE, "PNBA", "2026-06-24");

    // 'The New Girl: First Crush' is rank 1 in EARLY & MIDDLE GRADE READERS — not MASS MARKET
    const newGirl = books.find((b) => b.isbn === "9781338762488");
    expect(newGirl?.category).toBe("EARLY & MIDDLE GRADE READERS");
  });

  it("does not assign more than 15 books to any single category in this fixture", () => {
    // The PNBA list caps each category at 10 or 15 books; >15 in one bucket
    // means a sibling category header was missed and books got rolled up.
    const books = parseRegionalList(FIXTURE, "PNBA", "2026-06-24");
    const counts: Record<string, number> = {};
    for (const b of books) {
      const key = b.category ?? "(none)";
      counts[key] = (counts[key] ?? 0) + 1;
    }
    for (const [cat, n] of Object.entries(counts)) {
      expect(n, `category ${cat} has ${n} books, expected <= 15`).toBeLessThanOrEqual(15);
    }
  });
});
