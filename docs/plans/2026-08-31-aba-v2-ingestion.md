# ABA IndieBound v2 Ingestion — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dead bookweb.org `.txt`/Drive scraping pipeline with ingestion from ABA's new IndieBound v2 Google Sheets, backfill the resulting data gaps, and audit the existing history against the new archive.

**Architecture:** A Trigger.dev task resolves `abaorg.link/{slug}-bestsellers-sheet-{date}` to a Google Sheet ID, enumerates the workbook's tab names from its xlsx `workbook.xml` (to detect renames), then fetches each mapped tab as clean CSV via the `gviz` endpoint. Region-weeks are replaced atomically on content change (delete + insert, hash-gated). The browser stops fetching ABA entirely and reads only stored data.

**Tech Stack:** Trigger.dev v4 (`@trigger.dev/sdk`), Supabase (Postgres + Edge Functions), Vite/React/TypeScript, Vitest, `fflate` (zip reading only)

**Design doc:** `docs/plans/2026-08-31-aba-v2-ingestion-design.md`

---

## Critical context for someone with no history here

**This is a total source break, not a bug.** Every legacy URL returns 404 or an
empty stub. Do not try to "fix" the old parsers — they are deleted.

**Two source endpoints, used for different jobs:**

1. `https://docs.google.com/spreadsheets/d/{id}/export?format=xlsx`
   Used **only** to read the list of tab names. An xlsx file is a ZIP; the tab
   names live in `xl/workbook.xml`. We never decode cells from it, because xlsx
   stores ISBNs as floats (`9.780063511637E12`) and prices as bare numbers.

2. `https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv&sheet={TAB}`
   Used for **all actual data**. Returns properly quoted CSV with ISBN as a
   string and price as `"$15.99"`.

**The trap you must not fall into:** the gviz endpoint returns **HTTP 200 with
the FIRST tab's data** when you ask for a tab name that does not exist. There is
no error. This is why step 1 exists — we only ever request names we have
confirmed are present. Never request a hardcoded tab name without enumerating
first.

**Vocabulary:** a "week" is identified by its **Wednesday publication date**
(`YYYY-MM-DD`). ABA's own "week ending" Sunday is three days earlier. Every URL
and every `week_date` column uses the Wednesday.

**Verification commands** (these work today, use them to sanity-check):

```bash
# Resolve a shortlink to a Sheet ID
curl -s -o /dev/null -w "%{url_effective}\n" -L \
  "https://abaorg.link/pnba-bestsellers-sheet-2026-08-26"

# Fetch one tab as clean CSV
curl -s -L "https://docs.google.com/spreadsheets/d/1XMFr7gNr0f9y74Y-tAIwr6A4_QTvlX6rrn2HCxuHbRA/gviz/tq?tqx=out:csv&sheet=Young%20Adult" | head -3
```

---

## Phase 0: Repo hygiene and fixtures

### Task 0.1: Commit the untracked working tree

There are untracked files from previous sessions. Get to a clean baseline before
touching anything, so later diffs are readable.

**Files:**
- Modify: `.gitignore`

**Step 1: Add build artifacts to .gitignore**

Append these lines to `.gitignore`:

```
*.tsbuildinfo
trigger.config.js
```

`trigger.config.js` matters: `npx tsc -b` emits it into the repo root, and its
presence breaks Trigger.dev deploys with `config-strip: Cannot set properties of
undefined`. If a deploy ever fails that way, delete that file.

**Step 2: Remove the stray build artifacts**

```bash
rm -f tsconfig.tsbuildinfo tsconfig.app.tsbuildinfo tsconfig.node.tsbuildinfo
```

**Step 3: Commit the docs and gitignore**

```bash
git add .gitignore CLAUDE.md docs/QUALITY.md docs/plans/
git commit -m "chore: track project docs, ignore build artifacts"
```

---

### Task 0.2: Capture real fixtures

Tests run against real ABA bytes, not hand-written mocks. Capture them once.

**Files:**
- Create: `trigger/__fixtures__/aba-v2/pnba-2026-08-26-workbook.xml`
- Create: `trigger/__fixtures__/aba-v2/pnba-2026-08-26-hardcover-fiction.csv`
- Create: `trigger/__fixtures__/aba-v2/pnba-2026-08-26-childrens-series.csv`
- Create: `trigger/__fixtures__/aba-v2/pnba-2026-08-26-report-details.csv`

**Step 1: Capture the workbook tab list**

```bash
mkdir -p trigger/__fixtures__/aba-v2
cd /tmp
ID=1XMFr7gNr0f9y74Y-tAIwr6A4_QTvlX6rrn2HCxuHbRA
curl -s -L "https://docs.google.com/spreadsheets/d/$ID/export?format=xlsx" -o aba.xlsx
unzip -p aba.xlsx xl/workbook.xml > "$OLDPWD/trigger/__fixtures__/aba-v2/pnba-2026-08-26-workbook.xml"
cd -
```

**Step 2: Capture three representative tabs**

`Hardcover Fiction` is the normal 8-column shape. `Childrens Series` is the
4-column no-ISBN shape we skip. `Report Details` is the validation tab.

```bash
ID=1XMFr7gNr0f9y74Y-tAIwr6A4_QTvlX6rrn2HCxuHbRA
BASE="https://docs.google.com/spreadsheets/d/$ID/gviz/tq?tqx=out:csv&sheet="
curl -s -L "${BASE}Hardcover%20Fiction" > trigger/__fixtures__/aba-v2/pnba-2026-08-26-hardcover-fiction.csv
curl -s -L "${BASE}Childrens%20Series"  > trigger/__fixtures__/aba-v2/pnba-2026-08-26-childrens-series.csv
curl -s -L "${BASE}Report%20Details"    > trigger/__fixtures__/aba-v2/pnba-2026-08-26-report-details.csv
```

**Step 3: Verify the fixtures look right**

```bash
head -2 trigger/__fixtures__/aba-v2/pnba-2026-08-26-hardcover-fiction.csv
cat trigger/__fixtures__/aba-v2/pnba-2026-08-26-report-details.csv
```

Expected: the first shows a quoted header row starting `"Rank","ISBN","Title"`.
The second shows `"PNBA Bestsellers"` then `"08/26/2026"`.

**Step 3b: Report Details label format — already verified for all 9 regions**

The validation in Task 2.5 assumes every region's label is exactly
`"{SLUG} Bestsellers"`. This was checked against the live sheets for all nine
regions on 2026-08-31 and holds (`GLIBA Bestsellers`, `NCIBA Bestsellers`,
`SCIBA Bestsellers`, …). If ABA ever changes the label format the check fails
loudly, which is the intended behavior. To re-verify:

```bash
for r in gliba miba mpiba naiba nciba neiba pnba sciba siba; do
  id=$(curl -s -o /dev/null -w "%{url_effective}" -L \
    "https://abaorg.link/$r-bestsellers-sheet-2026-08-26" \
    | grep -oE "/d/[^/]+" | cut -d/ -f3)
  curl -s -L "https://docs.google.com/spreadsheets/d/$id/gviz/tq?tqx=out:csv&sheet=Report%20Details" | head -1
done
```

**Step 4: Commit**

```bash
git add trigger/__fixtures__/aba-v2/
git commit -m "test: add ABA v2 sheet fixtures"
```

---

## Phase 1: Schema

### Task 1.1: Add the two new columns

ABA now supplies previous rank and weeks-on-list. Store them.

**Files:**
- Create: `supabase/migrations/20260831000000_add_aba_rank_columns.sql`

**Step 1: Write the migration**

```sql
-- ABA IndieBound v2 supplies "Last Week" and "Weeks on List" directly.
-- Both are nullable: ABA leaves them blank for new entries and for some
-- children's categories.
alter table regional_bestsellers
  add column if not exists last_week_rank integer,
  add column if not exists weeks_on_list  integer;

comment on column regional_bestsellers.last_week_rank is
  'Rank in the previous week per ABA. NULL when the book is new to the list.';
comment on column regional_bestsellers.weeks_on_list is
  'Total weeks on list per ABA. Counts ABA history, not our DB history.';
```

**Step 2: Apply it**

Run: `npm run db:push`

The `preflight-check.ts` script will prompt for confirmation. Expected: migration
applies cleanly.

**Step 3: Verify the columns exist**

```bash
npx supabase db diff --schema public | head -20
```

Expected: no pending diff for `regional_bestsellers`.

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add last_week_rank and weeks_on_list to regional_bestsellers"
```

---

## Phase 2: The source client

> **AMENDMENT 2026-09-01, discovered during Task 0.2:** the gviz CSV endpoint
> cannot serve the tabs `Childrens Series` and `Childrens Series TItles` — it
> silently returns the FIRST tab's data for both, with `"status":"ok"` even in
> JSON mode, so the failure is undetectable at request time. Sequential gids do
> not exist (only `gid=0`). Therefore **all cell data is parsed from the xlsx
> workbook itself**, where tab→data correspondence is structural
> (`workbook.xml` name → rels → `sheetN.xml`) and cannot mismatch; gviz is not
> used at all. Consequences for the tasks below:
>
> - Task 2.3 (CSV parser) is **dropped** — there is no CSV anywhere.
> - Task 2.4 reads rows from parsed xlsx cells: ISBNs arrive as floats and are
>   formatted with `toFixed(0)` then validated against `/^97[89]\d{10}$/`;
>   prices arrive as numbers and are formatted `"$" + n.toFixed(2)` to match
>   the DB's stored format.
> - Task 2.5 reads Report Details from xlsx cells; the date is an Excel serial.
> - Task 2.6 downloads exactly one file per region-week (the xlsx) — simpler
>   and fewer requests than the planned 13.
> - The fixture is the full workbook `pnba-2026-08-26.xlsx`; the gviz CSV
>   fixtures were removed.
>
> The implemented code is the authority for Phase 2 specifics; the task text
> below is kept for the record but describes the pre-amendment design.

### Task 2.1: Region and category maps

Pure data plus lookup functions. No I/O, so it is trivially testable.

**Files:**
- Create: `trigger/aba/maps.ts`
- Test: `trigger/aba/maps.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { REGION_SLUGS, dbRegionForSlug, dbCategoryForTab } from "./maps";

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
    expect(dbCategoryForTab("Childrens Series")).toBe("SKIP");
  });

  it("returns SKIP for the validation tab", () => {
    expect(dbCategoryForTab("Report Details")).toBe("SKIP");
  });

  // This is the guard against silent category drift.
  it("returns null for an unknown tab so the caller can fail loudly", () => {
    expect(dbCategoryForTab("Graphic Novels")).toBeNull();
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest --run trigger/aba/maps.test.ts`
Expected: FAIL — `Failed to resolve import "./maps"`

**Step 3: Write the implementation**

```typescript
/** ABA's URL slug for each region, paired with the code our DB already uses. */
export const REGION_SLUGS = [
  { slug: "gliba", db: "GLIBA" },
  { slug: "miba",  db: "MIBA"  },
  { slug: "mpiba", db: "MPIBA" },
  { slug: "naiba", db: "NAIBA" },
  { slug: "neiba", db: "NEIBA" },
  { slug: "pnba",  db: "PNBA"  },
  { slug: "siba",  db: "SIBA"  },
  // ABA renamed the California regions. We keep the legacy DB codes and
  // translate here; a real migration is deferred. See the design doc.
  { slug: "nciba", db: "CALIBAN" },
  { slug: "sciba", db: "CALIBAS" },
] as const;

export function dbRegionForSlug(slug: string): string | null {
  return REGION_SLUGS.find((r) => r.slug === slug)?.db ?? null;
}

/** Sentinel for tabs we deliberately do not ingest. */
export const SKIP = "SKIP";

/** Normalized tab name -> DB category. Keys are lowercase, single-spaced. */
const TAB_TO_CATEGORY: Record<string, string> = {
  "hardcover fiction": "HARDCOVER FICTION",
  "hardcover nonfiction": "HARDCOVER NONFICTION",
  "paperback fiction": "TRADE PAPERBACK FICTION",
  "paperback nonfiction": "TRADE PAPERBACK NONFICTION",
  "mass market paperback": "MASS MARKET",
  "childrens illustrated": "CHILDREN'S ILLUSTRATED",
  "childrens interest": "CHILDREN'S INTEREST",
  "childrens titles": "CHILDREN'S TITLES",
  "childrens series titles": "CHILDREN'S SERIES TITLES",
  "early and middle grade": "EARLY & MIDDLE GRADE READERS",
  "young adult": "YOUNG ADULT",
  // Series-level list: columns are Rank, Series, Author, Publisher — no ISBN,
  // and regional_bestsellers.isbn is NOT NULL. Deliberately not ingested.
  "childrens series": SKIP,
  // Validation only; handled separately.
  "report details": SKIP,
};

function normalizeTab(tab: string): string {
  return tab.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Returns the DB category, the SKIP sentinel, or null when the tab is
 * unrecognized. Callers MUST treat null as a hard failure — silently skipping
 * unknown tabs is how category drift went unnoticed in August 2026.
 */
export function dbCategoryForTab(tab: string): string | null {
  return TAB_TO_CATEGORY[normalizeTab(tab)] ?? null;
}
```

**Step 4: Run the test to verify it passes**

Run: `npx vitest --run trigger/aba/maps.test.ts`
Expected: PASS, 8 tests

**Step 5: Commit**

```bash
git add trigger/aba/maps.ts trigger/aba/maps.test.ts
git commit -m "feat(aba): add region slug and sheet tab category maps"
```

---

### Task 2.2: Parse tab names out of workbook.xml

An xlsx is a ZIP. We read exactly one entry from it.

**Files:**
- Create: `trigger/aba/workbook.ts`
- Test: `trigger/aba/workbook.test.ts`

**Step 1: Install the zip reader**

```bash
npm install fflate
```

`fflate` is a small, dependency-free zip/deflate implementation. We use it only
to pull one file out of the archive — we are not parsing spreadsheets.

**Step 2: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTabNames } from "./workbook";

const fixture = readFileSync(
  join(__dirname, "../__fixtures__/aba-v2/pnba-2026-08-26-workbook.xml"),
  "utf-8"
);

describe("parseTabNames", () => {
  it("extracts every tab name in order", () => {
    const tabs = parseTabNames(fixture);
    expect(tabs[0]).toBe("Hardcover Fiction");
    expect(tabs).toContain("Young Adult");
    expect(tabs).toContain("Report Details");
    expect(tabs).toHaveLength(13);
  });

  it("preserves ABA's typo rather than normalizing it away", () => {
    expect(parseTabNames(fixture)).toContain("Childrens Series TItles");
  });

  it("decodes XML entities in tab names", () => {
    const xml = '<sheets><sheet name="Fiction &amp; Poetry" sheetId="1"/></sheets>';
    expect(parseTabNames(xml)).toEqual(["Fiction & Poetry"]);
  });

  it("throws when the workbook has no sheets", () => {
    expect(() => parseTabNames("<workbook></workbook>")).toThrow(
      /no sheet names/i
    );
  });
});
```

**Step 3: Run the test to verify it fails**

Run: `npx vitest --run trigger/aba/workbook.test.ts`
Expected: FAIL — cannot resolve `./workbook`

**Step 4: Write the implementation**

```typescript
import { unzipSync, strFromU8 } from "fflate";

/**
 * Extract sheet (tab) names from an xlsx workbook.xml.
 *
 * We read tab names from the xlsx rather than hardcoding them because the
 * gviz CSV endpoint silently returns the FIRST tab's data when asked for a
 * tab that does not exist. Enumerating first means we only ever request names
 * we know are present, which turns an ABA rename into a loud failure instead
 * of silently mislabeled data.
 */
export function parseTabNames(workbookXml: string): string[] {
  const names = [...workbookXml.matchAll(/<sheet[^>]*\bname="([^"]+)"/g)].map(
    (m) => decodeXmlEntities(m[1])
  );
  if (names.length === 0) {
    throw new Error("workbook.xml contained no sheet names");
  }
  return names;
}

/** Pull xl/workbook.xml out of an xlsx byte buffer. */
export function workbookXmlFromXlsx(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === "xl/workbook.xml" });
  const entry = files["xl/workbook.xml"];
  if (!entry) throw new Error("xlsx archive has no xl/workbook.xml");
  return strFromU8(entry);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
```

**Step 5: Run the test to verify it passes**

Run: `npx vitest --run trigger/aba/workbook.test.ts`
Expected: PASS, 4 tests

**Step 6: Commit**

```bash
git add package.json package-lock.json trigger/aba/workbook.ts trigger/aba/workbook.test.ts
git commit -m "feat(aba): read sheet tab names from xlsx workbook.xml"
```

---

### Task 2.3: CSV parsing

The gviz endpoint returns quoted CSV. Values contain commas and quotes
(`"Erin Hunter, Gibson Twist"`, `Spiegel & Grau`), so a `split(",")` will not do.

**Files:**
- Create: `trigger/aba/csv.ts`
- Test: `trigger/aba/csv.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("parses quoted fields", () => {
    expect(parseCsv('"a","b"\n"1","2"')).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('"Hunter, Erin","Scholastic"')).toEqual([
      ["Hunter, Erin", "Scholastic"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('"He said ""hi"""')).toEqual([['He said "hi"']]);
  });

  it("preserves empty fields as empty strings", () => {
    expect(parseCsv('"1","","3"')).toEqual([["1", "", "3"]]);
  });

  it("ignores a trailing newline", () => {
    expect(parseCsv('"a"\n')).toEqual([["a"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv('"a"\r\n"b"')).toEqual([["a"], ["b"]]);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest --run trigger/aba/csv.test.ts`
Expected: FAIL — cannot resolve `./csv`

**Step 3: Write the implementation**

```typescript
/**
 * Minimal RFC 4180 CSV parser, sufficient for Google's gviz output.
 * Google always quotes every field, but we handle unquoted fields anyway.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += ch;
      i++;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
```

**Step 4: Run the test to verify it passes**

Run: `npx vitest --run trigger/aba/csv.test.ts`
Expected: PASS, 6 tests

**Step 5: Commit**

```bash
git add trigger/aba/csv.ts trigger/aba/csv.test.ts
git commit -m "feat(aba): add CSV parser for gviz output"
```

---

### Task 2.4: Turn a tab's CSV into book rows

**Files:**
- Create: `trigger/aba/rows.ts`
- Test: `trigger/aba/rows.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rowsFromCsv } from "./rows";

const hardcoverFiction = readFileSync(
  join(__dirname, "../__fixtures__/aba-v2/pnba-2026-08-26-hardcover-fiction.csv"),
  "utf-8"
);

describe("rowsFromCsv", () => {
  it("parses the real PNBA hardcover fiction tab", () => {
    const rows = rowsFromCsv(hardcoverFiction);
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

  it("keeps the ISBN as a 13-digit string", () => {
    for (const row of rowsFromCsv(hardcoverFiction)) {
      expect(row.isbn).toMatch(/^97[89]\d{10}$/);
    }
  });

  it("maps a blank Last Week to null, not zero", () => {
    const csv =
      '"Rank","ISBN","Title","Author","Publisher","Price","Last Week","Weeks on List"\n' +
      '"1","9780593798430","T","A","P","$28.00","","1"';
    expect(rowsFromCsv(csv)[0].last_week_rank).toBeNull();
  });

  it("maps a blank Weeks on List to null", () => {
    const csv =
      '"Rank","ISBN","Title","Author","Publisher","Price","Last Week","Weeks on List"\n' +
      '"1","9780593798430","T","A","P","$28.00","3",""';
    expect(rowsFromCsv(csv)[0].weeks_on_list).toBeNull();
  });

  it("drops rows whose ISBN is not a valid ISBN-13", () => {
    const csv =
      '"Rank","ISBN","Title","Author","Publisher","Price","Last Week","Weeks on List"\n' +
      '"1","not-an-isbn","T","A","P","$1.00","1","1"\n' +
      '"2","9780593798430","Good","A","P","$1.00","1","1"';
    const rows = rowsFromCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Good");
  });

  it("throws when the expected columns are missing", () => {
    expect(() => rowsFromCsv('"Rank","Series","Author","Publisher"\n"1","X","Y","Z"'))
      .toThrow(/missing required column/i);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest --run trigger/aba/rows.test.ts`
Expected: FAIL — cannot resolve `./rows`

**Step 3: Write the implementation**

```typescript
import { parseCsv } from "./csv";

export interface AbaBookRow {
  rank: number;
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  price: string | null;
  last_week_rank: number | null;
  weeks_on_list: number | null;
}

const REQUIRED = ["rank", "isbn", "title", "author"] as const;

function headerIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    idx[h.trim().toLowerCase()] = i;
  });
  for (const col of REQUIRED) {
    if (!(col in idx)) {
      throw new Error(`Sheet tab is missing required column: "${col}"`);
    }
  }
  return idx;
}

/** Blank, "-", or non-numeric becomes null rather than 0. */
function optionalInt(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "new") return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

export function rowsFromCsv(csv: string): AbaBookRow[] {
  const table = parseCsv(csv);
  if (table.length === 0) return [];

  const idx = headerIndex(table[0]);
  const out: AbaBookRow[] = [];

  for (const cells of table.slice(1)) {
    const isbn = (cells[idx.isbn] ?? "").trim();
    // ABA occasionally emits placeholder or blank ISBNs. regional_bestsellers
    // keys on ISBN, so a row without a real one is unusable.
    if (!/^97[89]\d{10}$/.test(isbn)) continue;

    const rank = optionalInt(cells[idx.rank]);
    if (rank === null) continue;

    out.push({
      rank,
      isbn,
      title: (cells[idx.title] ?? "").trim(),
      author: (cells[idx.author] ?? "").trim(),
      publisher: (cells[idx.publisher] ?? "").trim() || null,
      price: (cells[idx.price] ?? "").trim() || null,
      last_week_rank: optionalInt(cells[idx["last week"]]),
      weeks_on_list: optionalInt(cells[idx["weeks on list"]]),
    });
  }
  return out;
}
```

**Step 4: Run the test to verify it passes**

Run: `npx vitest --run trigger/aba/rows.test.ts`
Expected: PASS, 6 tests

**Step 5: Commit**

```bash
git add trigger/aba/rows.ts trigger/aba/rows.test.ts
git commit -m "feat(aba): convert gviz CSV tabs into book rows"
```

---

### Task 2.5: Validate the Report Details tab

This is the guard that makes the week-shift bug class impossible.

**Files:**
- Create: `trigger/aba/reportDetails.ts`
- Test: `trigger/aba/reportDetails.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReportDetails, assertReportMatches } from "./reportDetails";

const fixture = readFileSync(
  join(__dirname, "../__fixtures__/aba-v2/pnba-2026-08-26-report-details.csv"),
  "utf-8"
);

describe("parseReportDetails", () => {
  it("reads the region label and week date", () => {
    expect(parseReportDetails(fixture)).toEqual({
      label: "PNBA Bestsellers",
      weekDate: "2026-08-26",
    });
  });

  it("parses MM/DD/YYYY into an ISO date", () => {
    const csv = '"SIBA Bestsellers"\n"03/25/2026"';
    expect(parseReportDetails(csv).weekDate).toBe("2026-03-25");
  });

  it("also accepts an Excel serial date", () => {
    const csv = '"PNBA Bestsellers"\n"46260"';
    expect(parseReportDetails(csv).weekDate).toBe("2026-08-26");
  });
});

describe("assertReportMatches", () => {
  it("passes when region and date agree", () => {
    expect(() =>
      assertReportMatches(fixture, "PNBA", "2026-08-26")
    ).not.toThrow();
  });

  it("throws when the sheet is for a different week", () => {
    expect(() => assertReportMatches(fixture, "PNBA", "2026-08-19")).toThrow(
      /week date mismatch/i
    );
  });

  it("throws when the sheet is for a different region", () => {
    expect(() => assertReportMatches(fixture, "SIBA", "2026-08-26")).toThrow(
      /region mismatch/i
    );
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest --run trigger/aba/reportDetails.test.ts`
Expected: FAIL — cannot resolve `./reportDetails`

**Step 3: Write the implementation**

```typescript
import { parseCsv } from "./csv";

export interface ReportDetails {
  label: string;
  weekDate: string; // ISO YYYY-MM-DD
}

/** Excel's day 0 is 1899-12-30. */
function fromExcelSerial(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function parseReportDetails(csv: string): ReportDetails {
  const rows = parseCsv(csv);
  const label = (rows[0]?.[0] ?? "").trim();
  const rawDate = (rows[1]?.[0] ?? "").trim();

  let weekDate: string;
  const mdy = rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mdy) {
    weekDate = `${mdy[3]}-${mdy[1]}-${mdy[2]}`;
  } else if (/^\d+(\.\d+)?$/.test(rawDate)) {
    weekDate = fromExcelSerial(Math.round(Number(rawDate)));
  } else {
    throw new Error(`Report Details has an unparseable date: "${rawDate}"`);
  }

  return { label, weekDate };
}

/**
 * Confirm the downloaded workbook is the one we asked for.
 *
 * The week label comes from our request URL; this proves the file agrees.
 * Without this check, requesting week N and receiving week N-1 would be
 * written to the database under the wrong date — the 2026 week-shift bug.
 */
export function assertReportMatches(
  csv: string,
  expectedDbRegion: string,
  expectedWeekDate: string
): void {
  const { label, weekDate } = parseReportDetails(csv);

  if (weekDate !== expectedWeekDate) {
    throw new Error(
      `Report Details week date mismatch: sheet says ${weekDate}, expected ${expectedWeekDate}`
    );
  }

  // The label uses ABA's region naming ("PNBA Bestsellers"). For the two
  // California regions our DB code differs from ABA's, so compare on the slug
  // the caller resolved rather than the DB code.
  const slugFromLabel = label.split(/\s+/)[0]?.toUpperCase() ?? "";
  const expected = expectedDbRegion.toUpperCase();
  const CALIFORNIA: Record<string, string> = { CALIBAN: "NCIBA", CALIBAS: "SCIBA" };
  const acceptable = CALIFORNIA[expected] ?? expected;

  if (slugFromLabel !== acceptable) {
    throw new Error(
      `Report Details region mismatch: sheet says "${label}", expected ${acceptable}`
    );
  }
}
```

**Step 4: Run the test to verify it passes**

Run: `npx vitest --run trigger/aba/reportDetails.test.ts`
Expected: PASS, 6 tests

**Step 5: Commit**

```bash
git add trigger/aba/reportDetails.ts trigger/aba/reportDetails.test.ts
git commit -m "feat(aba): validate workbook region and week against the request"
```

---

### Task 2.6: The network client

Everything above is pure. This task holds the only I/O.

**Files:**
- Create: `trigger/aba/client.ts`
- Test: `trigger/aba/client.test.ts`

**Step 1: Write the failing test**

`fetch` is stubbed — no network calls in tests.

```typescript
import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveSheetId, sheetUrls, fetchRegionWeek } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("sheetUrls", () => {
  it("builds the shortlink for a region and week", () => {
    expect(sheetUrls("pnba", "2026-08-26").shortlink).toBe(
      "https://abaorg.link/pnba-bestsellers-sheet-2026-08-26"
    );
  });

  it("URL-encodes tab names with spaces", () => {
    expect(sheetUrls("pnba", "2026-08-26").gviz("abc", "Young Adult")).toBe(
      "https://docs.google.com/spreadsheets/d/abc/gviz/tq?tqx=out:csv&sheet=Young%20Adult"
    );
  });
});

describe("resolveSheetId", () => {
  it("extracts the sheet id from the redirect target", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        url: "https://docs.google.com/spreadsheets/d/SHEET123/edit?usp=drivesdk",
      })
    );
    await expect(resolveSheetId("pnba", "2026-08-26")).resolves.toBe("SHEET123");
  });

  it("returns null when the shortlink does not redirect to Sheets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        url: "https://abaorg.link/pnba-bestsellers-sheet-2099-01-01",
      })
    );
    await expect(resolveSheetId("pnba", "2099-01-01")).resolves.toBeNull();
  });
});

describe("fetchRegionWeek", () => {
  it("fails loudly on an unrecognized tab name", async () => {
    const workbookXml =
      '<sheets><sheet name="Hardcover Fiction" sheetId="1"/>' +
      '<sheet name="Graphic Novels" sheetId="2"/></sheets>';

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("abaorg.link")) {
          return { ok: true, url: "https://docs.google.com/spreadsheets/d/X/edit" };
        }
        if (url.includes("format=xlsx")) {
          return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
        }
        return { ok: true, text: async () => "" };
      })
    );

    // parseTabNames is exercised via a seam so we can feed XML directly
    await expect(
      fetchRegionWeek("pnba", "2026-08-26", { _tabNamesOverride: () => parseStub(workbookXml) })
    ).rejects.toThrow(/unrecognized sheet tab: "Graphic Novels"/i);
  });
});

function parseStub(xml: string): string[] {
  return [...xml.matchAll(/name="([^"]+)"/g)].map((m) => m[1]);
}
```

**Step 2: Run the test to verify it fails**

Run: `npx vitest --run trigger/aba/client.test.ts`
Expected: FAIL — cannot resolve `./client`

**Step 3: Write the implementation**

```typescript
import { dbCategoryForTab, dbRegionForSlug, SKIP } from "./maps";
import { parseTabNames, workbookXmlFromXlsx } from "./workbook";
import { rowsFromCsv, type AbaBookRow } from "./rows";
import { assertReportMatches } from "./reportDetails";

const SHORTLINK_BASE = "https://abaorg.link";
const SHEETS_BASE = "https://docs.google.com/spreadsheets/d";

export function sheetUrls(slug: string, weekDate: string) {
  return {
    shortlink: `${SHORTLINK_BASE}/${slug}-bestsellers-sheet-${weekDate}`,
    xlsx: (id: string) => `${SHEETS_BASE}/${id}/export?format=xlsx`,
    gviz: (id: string, tab: string) =>
      `${SHEETS_BASE}/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`,
  };
}

/**
 * Follow the ABA shortlink to its Google Sheets target and return the file id.
 * Returns null when ABA has not published that week yet — the shortlink then
 * fails to redirect off abaorg.link.
 */
export async function resolveSheetId(
  slug: string,
  weekDate: string
): Promise<string | null> {
  const res = await fetch(sheetUrls(slug, weekDate).shortlink, {
    redirect: "follow",
  });
  const m = res.url.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

export interface RegionWeek {
  slug: string;
  dbRegion: string;
  weekDate: string;
  sheetId: string;
  /** DB category -> rows */
  byCategory: Map<string, AbaBookRow[]>;
}

interface Options {
  /** Test seam: bypass the xlsx download and supply tab names directly. */
  _tabNamesOverride?: () => string[];
}

export async function fetchRegionWeek(
  slug: string,
  weekDate: string,
  opts: Options = {}
): Promise<RegionWeek | null> {
  const dbRegion = dbRegionForSlug(slug);
  if (!dbRegion) throw new Error(`Unknown region slug: ${slug}`);

  const sheetId = await resolveSheetId(slug, weekDate);
  if (!sheetId) return null; // not published yet

  const urls = sheetUrls(slug, weekDate);

  // 1. Enumerate tabs. Never request a tab name we have not seen here:
  //    gviz answers 200 with the FIRST tab's data for an unknown name.
  const tabs = opts._tabNamesOverride
    ? opts._tabNamesOverride()
    : parseTabNames(
        workbookXmlFromXlsx(
          new Uint8Array(await (await fetchOk(urls.xlsx(sheetId))).arrayBuffer())
        )
      );

  // 2. Validate the workbook is the week and region we asked for.
  if (tabs.some((t) => t.trim().toLowerCase() === "report details")) {
    const csv = await (await fetchOk(urls.gviz(sheetId, "Report Details"))).text();
    assertReportMatches(csv, dbRegion, weekDate);
  }

  // 3. Resolve every tab before fetching anything, so an unknown tab aborts
  //    the region rather than half-ingesting it.
  const planned: Array<{ tab: string; category: string }> = [];
  for (const tab of tabs) {
    const category = dbCategoryForTab(tab);
    if (category === null) {
      throw new Error(
        `Unrecognized sheet tab: "${tab}" for ${slug} ${weekDate}. ` +
          `ABA may have added or renamed a category — update trigger/aba/maps.ts.`
      );
    }
    if (category !== SKIP) planned.push({ tab, category });
  }

  // 4. Fetch each mapped tab.
  const byCategory = new Map<string, AbaBookRow[]>();
  for (const { tab, category } of planned) {
    const csv = await (await fetchOk(urls.gviz(sheetId, tab))).text();
    byCategory.set(category, rowsFromCsv(csv));
  }

  return { slug, dbRegion, weekDate, sheetId, byCategory };
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  return res;
}
```

**Step 4: Run the test to verify it passes**

Run: `npx vitest --run trigger/aba/client.test.ts`
Expected: PASS

**Step 5: Run the whole aba suite**

Run: `npx vitest --run trigger/aba/`
Expected: PASS, all files

**Step 6: Commit**

```bash
git add trigger/aba/client.ts trigger/aba/client.test.ts
git commit -m "feat(aba): add sheet resolution and tab fetching client"
```

---

## Phase 3: The ingest task

### Task 3.1: Row flattening and content hashing

**Files:**
- Create: `trigger/aba/persist.ts`
- Test: `trigger/aba/persist.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { contentHash, toDbRows } from "./persist";
import type { RegionWeek } from "./client";

function week(overrides: Partial<RegionWeek> = {}): RegionWeek {
  return {
    slug: "pnba",
    dbRegion: "PNBA",
    weekDate: "2026-08-26",
    sheetId: "X",
    byCategory: new Map([
      [
        "HARDCOVER FICTION",
        [
          {
            rank: 1,
            isbn: "9780063511637",
            title: "Whistler",
            author: "Ann Patchett",
            publisher: "Harper",
            price: "$30.00",
            last_week_rank: 2,
            weeks_on_list: 12,
          },
        ],
      ],
    ]),
    ...overrides,
  };
}

describe("toDbRows", () => {
  it("flattens categories into regional_bestsellers rows", () => {
    expect(toDbRows(week())).toEqual([
      {
        region: "PNBA",
        week_date: "2026-08-26",
        category: "HARDCOVER FICTION",
        rank: 1,
        isbn: "9780063511637",
        title: "Whistler",
        author: "Ann Patchett",
        publisher: "Harper",
        price: "$30.00",
        last_week_rank: 2,
        weeks_on_list: 12,
        list_title: "PNBA Independent Bestsellers",
      },
    ]);
  });
});

describe("contentHash", () => {
  it("is stable for identical content", () => {
    expect(contentHash(week())).toBe(contentHash(week()));
  });

  it("changes when a rank changes", () => {
    const changed = week();
    changed.byCategory.get("HARDCOVER FICTION")![0].rank = 2;
    expect(contentHash(changed)).not.toBe(contentHash(week()));
  });

  it("ignores the sheet id, which changes every week by design", () => {
    expect(contentHash(week({ sheetId: "DIFFERENT" }))).toBe(contentHash(week()));
  });
});
```

**Step 2: Run to verify it fails**

Run: `npx vitest --run trigger/aba/persist.test.ts`
Expected: FAIL — cannot resolve `./persist`

**Step 3: Write the implementation**

```typescript
import { createHash } from "node:crypto";
import type { RegionWeek } from "./client";

export interface DbRow {
  region: string;
  week_date: string;
  category: string;
  rank: number;
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  price: string | null;
  last_week_rank: number | null;
  weeks_on_list: number | null;
  list_title: string;
}

export function toDbRows(week: RegionWeek): DbRow[] {
  const rows: DbRow[] = [];
  for (const [category, books] of week.byCategory) {
    for (const b of books) {
      rows.push({
        region: week.dbRegion,
        week_date: week.weekDate,
        category,
        rank: b.rank,
        isbn: b.isbn,
        title: b.title,
        author: b.author,
        publisher: b.publisher,
        price: b.price,
        last_week_rank: b.last_week_rank,
        weeks_on_list: b.weeks_on_list,
        list_title: `${week.dbRegion} Independent Bestsellers`,
      });
    }
  }
  return rows;
}

/**
 * Hash of the meaningful content only. Deliberately excludes sheetId, which
 * is different every week even when the content is unchanged.
 */
export function contentHash(week: RegionWeek): string {
  const canonical = toDbRows(week)
    .map((r) =>
      [
        r.category, r.rank, r.isbn, r.title, r.author,
        r.publisher ?? "", r.price ?? "",
        r.last_week_rank ?? "", r.weeks_on_list ?? "",
      ].join("|") // delimited so ("CAT",11) and ("CAT1",1) cannot collide
    )
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}
```

**Step 4: Run to verify it passes**

Run: `npx vitest --run trigger/aba/persist.test.ts`
Expected: PASS, 4 tests

**Step 5: Commit**

```bash
git add trigger/aba/persist.ts trigger/aba/persist.test.ts
git commit -m "feat(aba): add row flattening and content hashing"
```

---

### Task 3.2: Add the uniqueness safety net

> **AMENDMENT 2026-09-01:** the duplicate pre-check found ~4,300 colliding
> slots through 2026-07-29 — nearly all MASS MARKET / YOUNG ADULT, i.e. the
> old parser's category-swallowing bug: several real lists coexist under one
> label with 2–4 distinct ISBNs per rank slot. These are mislabeled real
> books, NOT deletable duplicates. The index was therefore created PARTIAL
> (`where week_date >= '2026-08-01'`) — everything the new pipeline writes is
> covered; historical mislabeling is left for the Phase 4 audit to quantify
> (within the archive window a full re-ingest could repair it, subject to a
> decision after the audit reports). Delete-then-insert persistence never
> needed the index as an ON CONFLICT target, so partial costs nothing.

The upsert needs a unique index to conflict on.

**Files:**
- Create: `supabase/migrations/20260831000100_regional_bestsellers_unique.sql`

**Step 1: Check for existing duplicates first**

Run this in the Supabase SQL editor. It must return zero rows before the index
can be created:

```sql
select region, week_date, category, rank, count(*)
from regional_bestsellers
group by region, week_date, category, rank
having count(*) > 1;
```

If it returns rows, resolve them before continuing — do not delete blindly, and
consult the week-shift history first.

**Step 2: Write the migration**

```sql
-- Ingestion upserts on this key so re-runs are free and a mid-week ABA
-- correction overwrites in place rather than duplicating.
create unique index if not exists regional_bestsellers_region_week_cat_rank_idx
  on regional_bestsellers (region, week_date, category, rank);
```

**Step 3: Apply and verify**

Run: `npm run db:push`
Expected: applies cleanly. If it fails with a uniqueness violation, return to
step 1.

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): add unique index for idempotent bestseller upserts"
```

---

### Task 3.3: The ingest task itself

Two persistence rules matter here, both learned the hard way:

1. **Replace, never merge.** When content changes we delete the region-week's
   rows and insert fresh, inside one transaction-ish sequence. A plain upsert
   would leave ghosts: a mid-week correction that shrinks a category from 15
   to 14 entries would keep the stale rank-15 row, and backfilling the
   PNBA-only weeks (whose existing rows use the old parser's category labels)
   would duplicate books under two category names. The unique index from Task
   3.2 becomes a safety net, not the merge mechanism.
2. **Check the hash before fetching everything again.** The cron must not
   re-download ~13 files per region-week on every 20-minute tick.

**Files:**
- Create: `trigger/ingest-bestsellers.ts`

**Step 1: Write the task**

```typescript
import { schedules, task, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { REGION_SLUGS } from "./aba/maps";
import { fetchRegionWeek } from "./aba/client";
import { toDbRows, contentHash } from "./aba/persist";

function supabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** The Wednesday on or before the given date. */
export function publicationWednesday(from: Date = new Date()): string {
  const d = new Date(from);
  const day = d.getUTCDay();
  const diff = day >= 3 ? day - 3 : day + 4;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function priorWednesdays(weekDate: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    const d = new Date(`${weekDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Ingest one region-week.
 *
 * skipIfIngested: return early (without any network fetch) when fetch_cache
 * already records a successful ingest for this region-week. The polling cron
 * uses this so that, once a week has landed, later ticks cost one DB read
 * instead of ~13 HTTP downloads. The recheck task and backfill pass false to
 * force a fresh fetch-and-compare.
 */
export const ingestRegionWeek = task({
  id: "ingest-region-week",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30_000 },
  run: async (payload: { slug: string; weekDate: string; skipIfIngested?: boolean }) => {
    const { slug, weekDate, skipIfIngested } = payload;
    const db = supabase();
    const cacheKey = (dbRegion: string) => `aba_v2_${dbRegion}_${weekDate}`;

    if (skipIfIngested) {
      const dbRegion = REGION_SLUGS.find((r) => r.slug === slug)!.db;
      const { data: existing } = await db
        .from("fetch_cache")
        .select("cache_key")
        .eq("cache_key", cacheKey(dbRegion))
        .maybeSingle();
      if (existing) {
        return { status: "already_ingested" as const, slug, weekDate, rows: 0 };
      }
    }

    const week = await fetchRegionWeek(slug, weekDate);
    if (!week) {
      logger.info("Not published yet", { slug, weekDate });
      return { status: "unpublished" as const, slug, weekDate, rows: 0 };
    }

    const hash = contentHash(week);
    const key = cacheKey(week.dbRegion);

    const { data: cached } = await db
      .from("fetch_cache")
      .select("data")
      .eq("cache_key", key)
      .maybeSingle();

    if ((cached?.data as { hash?: string } | null)?.hash === hash) {
      logger.info("Unchanged, skipping write", { slug, weekDate });
      return { status: "unchanged" as const, slug, weekDate, rows: 0 };
    }

    // Replace the region-week wholesale. Delete-then-insert (not upsert) so
    // rows that no longer exist in the source cannot linger, and so backfill
    // over the old-parser PNBA rows cannot duplicate books across category
    // label variants.
    const rows = toDbRows(week);

    const { error: delError } = await db
      .from("regional_bestsellers")
      .delete()
      .eq("region", week.dbRegion)
      .eq("week_date", weekDate);
    if (delError) throw new Error(`Delete failed for ${slug} ${weekDate}: ${delError.message}`);

    const { error: insError } = await db.from("regional_bestsellers").insert(rows);
    if (insError) {
      // The week is now partially empty; do NOT record the hash, so the next
      // run re-fetches and repairs it. Trigger.dev retries handle transients.
      throw new Error(`Insert failed for ${slug} ${weekDate}: ${insError.message}`);
    }

    // Persist the resolved sheet id so history stays reachable even if the
    // abaorg.link shortener is ever retired.
    await db.from("fetch_cache").upsert(
      {
        cache_key: key,
        data: { hash, sheetId: week.sheetId, ingestedAt: new Date().toISOString() },
      },
      { onConflict: "cache_key" }
    );

    logger.info("Ingested", { slug, weekDate, rows: rows.length });
    return { status: "written" as const, slug, weekDate, rows: rows.length };
  },
});

/**
 * Wednesday polling cron: current week only, cheap once landed.
 *
 * ABA's publish time drifts, so we poll every 20 minutes across the window.
 * Before a region's sheet exists, a tick costs one shortlink resolve per
 * region (fetchRegionWeek returns null). After it lands, skipIfIngested makes
 * every later tick a single fetch_cache read per region. Total Wednesday
 * traffic: one full ingest per region plus pocket change — not thousands of
 * requests.
 */
export const weeklyIngest = schedules.task({
  id: "aba-weekly-ingest",
  cron: { pattern: "*/20 8-16 * * 3", timezone: "America/Los_Angeles" },
  run: async () => {
    const weekDate = publicationWednesday();
    const results = [];

    for (const { slug } of REGION_SLUGS) {
      const r = await ingestRegionWeek.triggerAndWait({
        slug,
        weekDate,
        skipIfIngested: true,
      });
      if (r.ok) results.push(r.output);
      else logger.error("Region failed", { slug, weekDate, error: r.error });
    }

    const written = results.filter((x) => x.status === "written");
    if (written.length > 0) {
      await recalcWeeks([weekDate]); // added in Task 3.4
    }

    logger.info("Weekly ingest tick complete", {
      weekDate,
      written: written.length,
      results: results.map((x) => `${x.slug}:${x.status}`),
    });
    return { weekDate, written: written.length };
  },
});

/**
 * Once-per-Wednesday recheck, after the publication window: force-refetch the
 * current week and the two prior weeks so a late ABA correction lands. This
 * is the only place old weeks are re-downloaded, so the rolling recheck costs
 * one pass per week, not one per tick.
 */
export const weeklyRecheck = schedules.task({
  id: "aba-weekly-recheck",
  cron: { pattern: "0 17 * * 3", timezone: "America/Los_Angeles" },
  run: async () => {
    const current = publicationWednesday();
    const weeks = [current, ...priorWednesdays(current, 2)];
    const touched: string[] = [];

    for (const weekDate of weeks) {
      for (const { slug } of REGION_SLUGS) {
        const r = await ingestRegionWeek.triggerAndWait({ slug, weekDate });
        if (r.ok && r.output.status === "written" && !touched.includes(weekDate)) {
          touched.push(weekDate);
        }
        if (!r.ok) logger.error("Recheck failed", { slug, weekDate, error: r.error });
      }
    }

    if (touched.length > 0) await recalcWeeks(touched); // added in Task 3.4

    logger.info("Weekly recheck complete", { weeks, touched });
    return { weeks, touched };
  },
});
```

`recalcWeeks` does not exist yet; Task 3.4 adds it. Until then, stub it as a
no-op so this task compiles, or implement Tasks 3.3 and 3.4 in one sitting.

**Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors from `trigger/`

**Step 3: Test against the real source in dev**

```bash
npm run dev:trigger
```

In the Trigger.dev dashboard, run `ingest-region-week` with payload
`{"slug":"pnba","weekDate":"2026-08-26"}`.

Expected: `status: "written"`, roughly 165 rows. Run it again and expect
`status: "unchanged"` (hash match, no write). Run a third time with
`{"slug":"pnba","weekDate":"2026-08-26","skipIfIngested":true}` and expect
`status: "already_ingested"` — that one never touched the network.

**Step 4: Verify in the database**

```sql
select category, count(*), min(rank), max(rank)
from regional_bestsellers
where region = 'PNBA' and week_date = '2026-08-26'
group by category order by category;
```

Expected: 11 categories, ranks starting at 1. `CHILDREN'S SERIES` must be
absent — that tab is deliberately skipped.

**Step 5: Commit**

```bash
git add trigger/ingest-bestsellers.ts
git commit -m "feat(trigger): ABA v2 ingest with replace-on-change and cheap polling"
```

---

### Task 3.4: Extract the recalc pipeline into `trigger/recalc.ts`

The scoring and feed logic lives inside `trigger/populate-regional-bestsellers.ts`
(deleted in Task 5.4), so it must be lifted out — not rewritten — before the
old task goes. Three pieces move, with two deliberate changes.

**What moves unchanged:**
- `calculateScore(rank, listSize)` — `trigger/populate-regional-bestsellers.ts:171`
- The `weekly_scores` upsert — same file, ~line 366, conflict key
  `isbn,region,week_date,category`, including the per-category `list_size`
  computation that precedes it
- The `REGIONS` config array (abbreviation/full_name) and the feed upload to
  storage bucket `feeds`, path `region/{regionCode}.json`, from ~line 503 on
- The final `generateElsewhereFeeds.trigger()` call

**Deliberate change 1 — feed inputs come from the new columns.** The old feed
assembly queried the previous week's rows and called the
`get_weeks_on_list_batch_regional` RPC. Both are now redundant:
`assembleFeedJson` takes `previousBooks: {isbn, rank}[]` and
`weeksOnList: Record<string, number>`, and the ingested rows carry ABA's own
values. Feed `trigger/feedGenerator.ts` stays completely untouched.

```typescript
const previousBooks: PreviousWeekBook[] = rows
  .filter((r) => r.last_week_rank !== null)
  .map((r) => ({ isbn: r.isbn, rank: r.last_week_rank! }));

const weeksOnList: Record<string, number> = Object.fromEntries(
  rows.filter((r) => r.weeks_on_list !== null)
       .map((r) => [r.isbn, r.weeks_on_list!])
);
```

**Deliberate change 2 — feeds regenerate only for the current publication
week.** The bucket holds ONE feed per region (`region/{code}.json`), always the
latest week. If `recalcWeeks(["2026-06-03"])` regenerated feeds, the live feed
would be overwritten with June data. Scores recalculate for any week; feeds
only when `weekDate === publicationWednesday()`.

**What does NOT move:** the 52-week cleanup delete (old task ~line 388). Keep
that in the weekly cron path only — never in a helper that backfill can reach,
or a backfill run could delete historical rows.

**Files:**
- Create: `trigger/recalc.ts`
- Test: `trigger/recalc.test.ts`
- Modify: `trigger/ingest-bestsellers.ts` (import `recalcWeeks`, drop the stub)

**Step 1: Write failing tests for the pure parts**

Test `calculateScore` (copy its existing behavior — verify against two or three
hand-computed values from the old file before moving it) and the two
derivations above: rows with null `last_week_rank` are excluded from
`previousBooks`; rows with null `weeks_on_list` are absent from the map.

**Step 2: Run tests to verify they fail, then move the code**

Run: `npx vitest --run trigger/recalc.test.ts` — FAIL, then implement
`recalcWeeks(weekDates: string[])`:

```
for each weekDate:
  read regional_bestsellers rows for that week (all regions)
  per region: compute category list sizes -> scores -> upsert weekly_scores
  if weekDate === publicationWednesday():
    per region: build previousBooks/weeksOnList from the rows (above),
    fetch descriptions from fetch_cache (google_books_info_{isbn}),
    assembleFeedJson(...), upload to feeds/region/{code}.json
    then generateElsewhereFeeds.trigger()
```

Copy the description-batching and error-isolation structure (per-region
try/catch, throw only if every region fails) from the old task verbatim — it
encodes real operational lessons.

**Step 3: Wire it into both cron tasks and typecheck**

Replace the Task 3.3 stub with the real import.
Run: `npx tsc --noEmit -p tsconfig.app.json` — clean.

**Step 4: Verify against the live system**

Trigger `aba-weekly-recheck` manually in the dashboard.
Expected: scores upserted for 3 weeks; 9 feeds regenerated for the current
week only. Download one feed from storage and diff against the currently
published version — sections and entries should match, and `last`/`weeks`
values should now come from ABA columns.

**Step 5: Commit**

```bash
git add trigger/recalc.ts trigger/recalc.test.ts trigger/ingest-bestsellers.ts
git commit -m "feat(trigger): extract score and feed recalc, feed from ABA columns"
```

---

## Phase 4: Backfill and audit

### Task 4.1: Fill the four missing weeks

**Files:**
- Create: `trigger/backfill-aba-v2.ts`

**Step 1: Write the backfill task**

```typescript
import { task, logger, wait } from "@trigger.dev/sdk";
import { REGION_SLUGS } from "./aba/maps";
import { ingestRegionWeek } from "./ingest-bestsellers";

/** Weeks with no data, or with only PNBA data, that the archive can supply. */
export const GAP_WEEKS = [
  "2026-08-26", // missing entirely
  "2026-08-19", // missing entirely
  "2026-06-24", // PNBA-only (110 rows) after the week-shift repair
  "2026-06-03", // PNBA-only (110 rows) after the week-shift repair
];

export const backfillGaps = task({
  id: "aba-backfill-gaps",
  run: async (payload: { weeks?: string[] }) => {
    const weeks = payload.weeks ?? GAP_WEEKS;
    const results = [];

    for (const weekDate of weeks) {
      for (const { slug } of REGION_SLUGS) {
        const r = await ingestRegionWeek.triggerAndWait({ slug, weekDate });
        if (r.ok) results.push(r.output);
        else logger.error("Backfill failed", { slug, weekDate, error: r.error });
        // Be a good citizen toward Google.
        await wait.for({ seconds: 2 });
      }
    }
    return { weeks, results };
  },
});
```

**Step 2: Run it for one week first**

Trigger `aba-backfill-gaps` with `{"weeks":["2026-08-26"]}`.
Expected: 9 regions written.

**Step 3: Verify before doing the rest**

```sql
select week_date, count(*) rows, count(distinct region) regions
from regional_bestsellers
where week_date = '2026-08-26' group by week_date;
```

Expected: 9 regions, roughly 1,400–1,500 rows.

**Step 4: Run the remaining weeks**

Trigger with no payload to process all of `GAP_WEEKS`.

**Step 5: Verify 06-03 and 06-24 gained the other eight regions**

```sql
select week_date, count(*) rows, count(distinct region) regions
from regional_bestsellers
where week_date in ('2026-06-03','2026-06-24')
group by week_date order by week_date;
```

Expected: both now show 9 regions instead of 1.

**Step 6: Recalculate weekly_scores for the backfilled weeks**

List rows without score rows leave the Awards and year-end pages silently
inconsistent, so this step is not optional. At the end of `backfillGaps.run`,
after the ingest loop, call the Task 3.4 helper:

```typescript
await recalcWeeks(weeks);
```

`recalcWeeks` recomputes `weekly_scores` for any week but regenerates feeds
only for the current publication week (the bucket holds one feed per region —
regenerating for a June week would overwrite the live feed). The nightly
aggregate tables (`book_performance_metrics`, `book_regional_performance`)
self-correct on their next cron run once `weekly_scores` is right.

Verify:

```sql
select week_date, count(*) scores
from weekly_scores
where week_date in ('2026-06-03','2026-06-24','2026-08-19','2026-08-26')
group by week_date order by week_date;
```

Expected: all four weeks present with score counts in the same ballpark as
neighboring weeks.

**Step 7: Commit**

```bash
git add trigger/backfill-aba-v2.ts
git commit -m "feat(trigger): backfill the four recoverable gap weeks"
```

---

### Task 4.2: Read-only audit of the existing history

This checks the manual week-shift repair against an independent source. It
**writes nothing** to `regional_bestsellers`.

**Files:**
- Create: `trigger/audit-aba-v2.ts`

**Step 1: Write the audit task**

```typescript
import { task, logger, wait } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";
import { REGION_SLUGS } from "./aba/maps";
import { fetchRegionWeek } from "./aba/client";

/** Every Wednesday from the archive start to the present. */
export function archiveWeeks(from = "2026-03-25", to = "2026-08-26"): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

export const auditHistory = task({
  id: "aba-audit-history",
  run: async (payload: { weeks?: string[] }) => {
    const db = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const weeks = payload.weeks ?? archiveWeeks();
    const discrepancies: unknown[] = [];

    for (const weekDate of weeks) {
      for (const { slug, db: dbRegion } of REGION_SLUGS) {
        const week = await fetchRegionWeek(slug, weekDate).catch((e) => {
          logger.warn("Audit fetch failed", { slug, weekDate, error: String(e) });
          return null;
        });
        if (!week) continue;

        const { data: stored } = await db
          .from("regional_bestsellers")
          .select("category,rank,isbn")
          .eq("region", dbRegion)
          .eq("week_date", weekDate);

        const storedByKey = new Map(
          (stored ?? []).map((r) => [`${r.category}|${r.rank}`, r.isbn])
        );

        let matched = 0;
        let mismatched = 0;
        for (const [category, books] of week.byCategory) {
          for (const b of books) {
            const key = `${category}|${b.rank}`;
            if (!storedByKey.has(key)) continue;
            if (storedByKey.get(key) === b.isbn) matched++;
            else {
              mismatched++;
              discrepancies.push({
                weekDate, region: dbRegion, category, rank: b.rank,
                stored: storedByKey.get(key), archive: b.isbn,
              });
            }
          }
        }
        logger.info("Audited", { weekDate, dbRegion, matched, mismatched });
        await wait.for({ seconds: 2 });
      }
    }

    logger.info("Audit complete", { weeks: weeks.length, discrepancies: discrepancies.length });
    return { weeks, discrepancyCount: discrepancies.length, discrepancies };
  },
});
```

**Step 2: Audit one known-good week first**

Trigger with `{"weeks":["2026-08-12"]}`.
Expected: high `matched`, near-zero `mismatched`. If a week is systematically
mismatched across every region and category at once, that is the signature of a
mislabeled week — exactly what this audit exists to find.

**Step 3: Run the full audit**

Trigger with no payload. This is roughly 200 region-weeks and will take a while.

**Note on directionality:** the comparison is archive → stored only. A stored
row with no archive counterpart (e.g. the old parser's drifted category labels)
is not flagged; it simply lowers the matched count for that region-week. That
is acceptable for the audit's purpose — detecting mislabeled weeks — but do
not read "0 mismatches" as "stored data is a superset-clean match".

**Step 4: Record the findings**

Write the discrepancy summary into
`docs/plans/2026-08-31-aba-v2-audit-results.md`. **Do not auto-correct anything.**
Bring the results back for a decision — the pre-archive weeks have no other
source of truth.

**Step 5: Commit**

```bash
git add trigger/audit-aba-v2.ts docs/plans/2026-08-31-aba-v2-audit-results.md
git commit -m "feat(trigger): add read-only audit of history against ABA archive"
```

---

## Phase 5: Frontend cutover

**Read this before starting Phase 5.** The main list page's data path today is:
`useBestsellerData` → `BestsellerParser.fetchBestsellerData()` →
`src/utils/bestsellerFetcher.ts` → CORS proxies → dead ABA URLs. The fetcher is
not an auxiliary module — it IS the primary read path, and it no longer has a
working source. This phase therefore has three parts, strictly in order: build
the replacement read path (5.1–5.2), rescue the one unrelated function living
in the doomed file (5.3), and only then delete (5.4). Do not reorder.

### Task 5.1: DB-backed read service

Build the function that assembles a `BestsellerList` (the UI's existing type,
`src/types/bestseller.ts`) from `regional_bestsellers`. No UI changes yet.

**Files:**
- Modify: `src/services/bestsellerApi.ts` (its header comment already declares
  it the designated replacement for client-side scraping)
- Test: `src/services/bestsellerApi.test.ts`

**Contract:**

```typescript
export async function fetchBestsellerListFromDb(options: {
  region: string;            // DB code, e.g. "PNBA"
  weekDate?: string;         // ISO Wednesday; default = latest week in DB
  comparisonWeek?: string;   // ISO Wednesday; default = weekDate - 7 days
}): Promise<{ current: BestsellerList; weekDate: string; comparisonWeek: string }>
```

**Behavior rules:**

1. When `weekDate` is omitted, resolve it with one cheap query:
   `select week_date ... order by week_date desc limit 1` for the region.
   (Supabase's 1000-row default limit makes "fetch all and reduce" a bug, not
   a style issue — never scan the table.)
2. Fetch the current week's rows for the region (~165 rows, well under the
   row cap), ordered by category, rank.
3. **Rank change:** when `comparisonWeek` is the default (exactly 7 days
   before `weekDate`), `previousRank` comes from the stored `last_week_rank`
   column — ABA is authoritative. When the caller picked a custom comparison
   week, fetch that week's rows and diff by ISBN within category instead.
4. **`weeksOnList`** always comes from the stored `weeks_on_list` column.
   Null stays undefined — the UI already treats missing as unknown.
5. **`isNew`** is `last_week_rank === null` in the default case; "absent from
   the comparison rows" in the custom case. **`wasDropped`** entries (books in
   the comparison week missing from current) require comparison rows, so
   compute them in both cases from the fetched comparison week.
6. `publisher`/`price` are nullable in the DB but required strings in
   `BestsellerBook` — coalesce to `""`.
7. Group rows into `BestsellerCategory[]` by the stored category, preserving
   the DB's category values as names; `BestsellerList.date` is `weekDate`,
   `title` is `"{region} Independent Bestsellers"`.

**Step 1: Write the failing tests**

Use the existing Supabase mock-builder pattern from
`src/utils/bestsellerFetcher.test.ts` — the mocks must be fully chainable AND
thenable (a `then` property so `await` resolves them); that pattern is already
established in this repo, copy it rather than inventing one. Cover:

- default week resolution uses the limit-1 query
- default comparison reads `last_week_rank` (no second rows query for ranks)
- custom comparison diffs against the fetched comparison rows
- `wasDropped` books appear with `wasDropped: true`
- null publisher/price become `""`
- null `weeks_on_list` stays undefined on the book

**Step 2: Run to verify they fail, implement, run to green**

Run: `npx vitest --run src/services/bestsellerApi.test.ts`

**Step 3: Commit**

```bash
git add src/services/bestsellerApi.ts src/services/bestsellerApi.test.ts
git commit -m "feat(api): assemble BestsellerList from regional_bestsellers"
```

---

### Task 5.2: Switch the UI to the DB read path

**Files:**
- Modify: `src/hooks/useBestsellerData.ts`
- Modify: `src/components/YearEndRankings/MethodologyCard.tsx`
- Test: existing hook/page tests

**Step 1: Rewire the hook**

In `useBestsellerData.ts`:

- Replace the `BestsellerParser.fetchBestsellerData(...)` call in the
  `queryFn` with `fetchBestsellerListFromDb({ region: currentRegion.abbreviation, comparisonWeek })`.
- **Delete the background historical-fetch effect** (the
  `shouldFetchNewData` / `fetchHistoricalData` / localStorage block). The
  browser no longer fetches from ABA at all; history arrives via ingestion.
- Keep the comparison-week state mechanics — the feature survives, served by
  rule 3 above.

**Step 2: Update the methodology copy**

`weeks_on_list` now reflects ABA's full count, not this app's DB history.
Long-running titles jump (e.g. 23 → 434) — correct and intended. Update
`MethodologyCard.tsx` to say the weeks-on-list figure comes from ABA.

**Step 3: Run the tests and fix assertions**

Run: `npx vitest --run src/`
Expected: failures limited to tests asserting derived rank values or mocking
`BestsellerParser`. Update them to the stored-column behavior. Then run the
app (`npm run dev`) and eyeball the main list page: ranks, change arrows, and
weeks-on-list render for the current week.

**Step 4: Commit**

```bash
git add src/
git commit -m "feat(ui): read bestseller lists from the database"
```

---

### Task 5.3: Rescue `batchGetBookAudiences` before deleting anything

`src/utils/bestsellerFetcher.ts` is about to be deleted, but it also contains
`batchGetBookAudiences`, which has **nothing to do with ABA fetching** and is
imported by surviving modules:

- `src/hooks/useBookAudiences.ts`
- `src/hooks/useAudiencesByIsbn.ts`
- `src/services/bookDataService.ts`

Deleting the file without moving this function first will break the build in a
way that looks like an unrelated failure. Note: `bookDataService.ts` already
owns `getDefaultAudience`/`ensureAudienceAssignment` — the fetcher re-exports
some of these as static wrappers, so check which direction each symbol
actually flows before moving.

**Step 1: Move the function**

Move `batchGetBookAudiences` (and any helper it drags along) into
`src/services/bookDataService.ts`, with its existing tests.

**Step 2: Update the importers**

```bash
grep -rn "batchGetBookAudiences" src
```

Point every import at `src/services/bookDataService.ts`.

**Step 3: Verify**

Run: `npx vitest --run src/ && npm run build`
Expected: both pass, with `bestsellerFetcher.ts` still present.

**Step 4: Commit**

```bash
git add src/
git commit -m "refactor: move batchGetBookAudiences out of the doomed fetch layer"
```

---

### Task 5.4: Delete the dead fetch layer

Do this **after** 5.1–5.3 are green, so deletion is a separate, revertible
commit.

**Files:**
- Delete: `src/utils/bestsellerFetcher.ts`, `src/utils/bestsellerFetcher.test.ts`
- Delete: `src/utils/bestsellerTextParser.ts`
- Delete: `src/utils/bestsellerParser.ts` (3-line barrel re-exporting the fetcher)
- Delete: `src/utils/bestsellerCache.ts` **only if** nothing but the fetcher
  imports it after 5.2 — it holds client-side fetch-decision logic
  (`shouldFetchNewData`, cache read/write) that is meaningless without live
  fetching. Verify with grep first; if something still uses it, leave it and
  note why.
- Delete: `trigger/bookweb-scraper.ts`, `trigger/bookweb-scraper.test.ts`
- Delete: `trigger/parseRegionalList.ts`, `trigger/parseRegionalList.test.ts`
- Delete: `trigger/populate-regional-bestsellers.ts` (recalc logic was lifted
  in Task 3.4)
- Delete: `supabase/functions/scrape-regional-urls/`, `fetch-bestseller-file/`,
  `fetch-regional-lists/`, `fetch-previous-week/`, `fetch-pnba-lists/`

**Step 1: Confirm nothing still imports them**

```bash
grep -rn "bestsellerFetcher\|bestsellerParser\|bestsellerTextParser\|bestsellerCache\|bookweb-scraper\|parseRegionalList\|populate-regional-bestsellers\|scrape-regional-urls\|fetch-bestseller-file\|fetch-previous-week\|fetch-regional-lists\|fetch-pnba-lists" src trigger supabase scripts
```

Expected: no results outside the files being deleted. Resolve any that remain
before deleting.

**Step 2: Delete**

```bash
git rm src/utils/bestsellerFetcher.ts src/utils/bestsellerFetcher.test.ts \
       src/utils/bestsellerTextParser.ts src/utils/bestsellerParser.ts \
       trigger/bookweb-scraper.ts trigger/bookweb-scraper.test.ts \
       trigger/parseRegionalList.ts trigger/parseRegionalList.test.ts \
       trigger/populate-regional-bestsellers.ts
git rm -r supabase/functions/scrape-regional-urls \
          supabase/functions/fetch-bestseller-file \
          supabase/functions/fetch-regional-lists \
          supabase/functions/fetch-previous-week \
          supabase/functions/fetch-pnba-lists
```

(Plus `bestsellerCache.ts` if step 1 cleared it.)

**Step 3: Update the deploy script**

`package.json` has `supabase:functions:deploy` referencing `fetch-pnba-lists`.
Remove it from that command.

**Step 4: Verify the build and tests**

Run: `npm run build && npx vitest --run`
Expected: both pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete the dead bookweb fetch and parse layer"
```

---

## Phase 6: Deploy

### Task 6.1: Deploy and verify

**Step 1: Confirm no stray config file**

```bash
ls trigger.config.js 2>/dev/null && rm trigger.config.js
```

Its presence breaks deploys with `config-strip: Cannot set properties of
undefined`.

**Step 2: Deploy**

```bash
npm run deploy:trigger
```

**Step 3: Confirm the schedule is attached**

Only tasks in the **latest deployment** run on a schedule. Check the Trigger.dev
dashboard shows both schedules (America/Los_Angeles):

- `aba-weekly-ingest` — `*/20 8-16 * * 3`
- `aba-weekly-recheck` — `0 17 * * 3`

**Step 4: Verify end to end the following Wednesday**

```sql
select week_date, count(*) rows, count(distinct region) regions
from regional_bestsellers
group by week_date order by week_date desc limit 3;
```

Expected: the new week present with 9 regions.

---

## Exit criteria

| Phase | Done when |
|---|---|
| 0 | Working tree clean; fixtures committed |
| 1 | `last_week_rank` and `weeks_on_list` exist |
| 2 | `npx vitest --run trigger/aba/` passes |
| 3 | Re-running the ingest reports `unchanged`; PNBA 2026-08-26 has 11 categories |
| 4 | 06-03 and 06-24 show 9 regions; audit results written up |
| 5 | Main page renders from the DB read path; `npm run build` and `npx vitest --run` pass with the old layer deleted |
| 6 | Schedule live; a real Wednesday ingests unattended |

## Do not touch

- `_bestseller_list_vs_<week>_v2` cache entries — the only record for weeks
  before 2026-03-25
- `regional_bestsellers_backup_weekshift_20260805` and
  `weekly_scores_backup_weekshift_20260805` — keep until the Phase 4 audit passes
