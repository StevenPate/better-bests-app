import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIpcCsv } from "./csv";

const fixture = readFileSync(
  join(__dirname, "../__fixtures__/ipc/fiction-2026-09-23.csv"),
  "utf-8"
);

describe("parseIpcCsv", () => {
  it("parses all 40 rows with sequential ranks", () => {
    const rows = parseIpcCsv(fixture);
    expect(rows).toHaveLength(40);
    expect(rows.map((r) => r.rank)).toEqual(
      Array.from({ length: 40 }, (_, i) => i + 1)
    );
  });

  it("parses the first row's fields", () => {
    const [first] = parseIpcCsv(fixture);
    expect(first).toEqual({
      rank: 1,
      title: "The Calamity Club",
      publisher: "Spiegel & Grau",
      isbn: "9781954118812",
      author: "Kathryn Stockett",
    });
  });

  // CONTENT-COUPLED but verified true in the 2026-09-23 file (row 2 is
  // The Odyssey / "Homer, Emily Wilson (Transl.)"). If a fixture refresh breaks
  // it, re-point it at whichever row has a quoted comma rather than deleting it.
  it("handles quoted fields containing commas", () => {
    const rows = parseIpcCsv(fixture);
    expect(rows[1].author).toBe("Homer, Emily Wilson (Transl.)");
  });

  it("collapses and trims whitespace in every field", () => {
    const [row] = parseIpcCsv(
      'Ranking,Title,Publisher,ISBN,Author\n1,  Padded  Title ,P ,9781954118812, A  B \n'
    );
    expect(row).toMatchObject({ title: "Padded Title", publisher: "P", author: "A B" });
  });

  it("rejects a malformed ISBN", () => {
    const bad = 'Ranking,Title,Publisher,ISBN,Author\n1,X,Y,notanisbn,Z\n';
    expect(() => parseIpcCsv(bad)).toThrow(/ISBN/);
  });

  it("rejects a non-sequential rank column", () => {
    const bad =
      "Ranking,Title,Publisher,ISBN,Author\n1,A,P,9781954118812,X\n3,B,P,9780393356250,Y\n";
    expect(() => parseIpcCsv(bad)).toThrow(/rank/i);
  });
});
