# IPC Independent Press Top 40 Ingestion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ingest the Independent Publishers Caucus (IPC) weekly Independent Press Top 40 lists (Fiction + Nonfiction) and present them on a dedicated `/indie-press` page, with historical backfill from IPC's public Drive archive.

**Architecture:** IPC rows are stored in the existing `regional_bestsellers` table under pseudo-region `IPC` with categories `FICTION` and `NONFICTION`, keyed by the same publication-Wednesday `week_date` convention as the ABA lists (IPC's sales week matches ABA's; IPC publishes the following Thursday). A new `trigger/ipc/` module fetches CSVs keylessly from IPC's public Google Drive archive (`embeddedfolderview` listing + `uc?export=download`), verified working live 2026-09-02. IPC is deliberately **never** written to `weekly_scores` — `trigger/recalc.ts` iterates `REGION_SLUGS` (the 9 ABA regions), so Year-in-Review aggregates, feeds, and Most National/Efficient metrics are untouched by construction. That argument covers the aggregates but **not** the four features that read `regional_bestsellers` directly and do not filter to ABA regions — Elsewhere (client + edge function), Unique Books, and the book-detail regional history. Those need an explicit ABA allowlist **before** any backfill runs, or IPC silently becomes a tenth peer region in all four. That is Task 5, and it is a hard prerequisite for Task 7. Momentum fields (`last_week_rank`, `weeks_on_list`) are computed at ingest time from our own stored history so the existing UI assembly (`fetchBestsellerListFromDb`) works unmodified.

**Tech Stack:** Trigger.dev v4 (`@trigger.dev/sdk` — see CLAUDE.md, never `client.defineJob`), Supabase, Vitest, React Router / React Query frontend.

**Embargo note:** The email arrives early Wednesday but the list is embargoed until Thursday. The weekly cron therefore polls **Thursday morning PT** against the public archive; nothing is published early.

**Key facts an engineer needs:**
- Archive folder: `https://drive.google.com/drive/folders/1QJawmDIsZWswQ2I5cMZzEjWPTFGOlUv3`, one subfolder per week named `M-D-YY` (usually the publication Thursday, e.g. `9-3-26`; a few early folders drift, e.g. `2-15-26` is a Sunday).
- CSVs (`independentpresstop40fiction.csv`, `independentpresstop40nonfiction.csv`) are present in **33 of the 37 archive folders**, the earliest being `1-29-26` → week_date `2026-01-28`. Surveyed live 2026-09-24; supersedes this plan's original "~April 2026 onward, Jan–Mar are PDF/JPG only" claim, which was wrong.
- After dedupe, **three** weeks have no CSVs: `1-15-26`, `1-22-26` and **`7-2-26`**. The last is a mid-season gap, not a start-of-archive artifact, so "no CSVs" must be handled as a normal `unpublished` outcome anywhere in the range — never treated as an error or as the end of the archive. (`2-12-26` also has none, but it loses the dedupe to `2-15-26`, which does.)
- **CSV filenames are not stable.** Folder `7-9-26` holds `independentpresstop40fiction - Sheet1 (2).csv` and the matching nonfiction file — a re-export from Google Sheets, with a " - Sheet1" suffix and a " (2)" dedup counter. Exact-name matching silently drops that week. `findCsvIds` in Task 2 matches on the category prefix + `.csv`, preferring the canonical name. The two category prefixes are distinct (`...top40nonfiction` does not start with `...top40fiction`), so anchoring at the start keeps them from colliding.
- **Two folders can map to the same `week_date`.** `2-12-26` (Thursday) and `2-15-26` (Sunday drift) both resolve to `2026-02-11`. Today this is benign — `2-12-26` has no CSVs — but nothing detects it, and `skipIfIngested` would mask a real collision as `already_ingested`. Task 2 adds a dedup that prefers the CSV-bearing folder.
- The CSV format is stable across the whole archive: the parser in Task 1 was run against the earliest (`1-29-26`) and current (`9-24-26`) files, both categories, 40 rows each, header exactly `Ranking,Title,Publisher,ISBN,Author`.
- CSV columns: `Ranking,Title,Publisher,ISBN,Author` — 40 rows, ISBN-13, quoted fields may contain commas. Known dirt: trailing spaces, occasional ALL-CAPS authors. Normalize whitespace only; do not attempt name-casing fixes.
- Keyless Drive access (no API key): folder listing via `https://drive.google.com/embeddedfolderview?id=<FOLDER_ID>#list`, file download via `https://drive.google.com/uc?export=download&id=<FILE_ID>`.
- `regional_bestsellers` has no region CHECK constraint (verified); `'IPC'` inserts fine. PK is `id` only; the ingest uses delete-then-insert per region-week, same as ABA (`trigger/ingest-bestsellers.ts:82-97`).
- The RPC `get_weeks_on_list_batch_regional(isbn_list, target_region)` (migration `20251106000001`) counts distinct `week_date`s per ISBN for any region — reuse with `'IPC'`.
- Run tests with `npx vitest run <path>`. Existing trigger tests live next to sources (`trigger/aba/*.test.ts`) with fixtures in `trigger/__fixtures__/`.

---

### Task 1: CSV parsing (`trigger/ipc/csv.ts`)

**Files:**
- Create: `trigger/__fixtures__/ipc/fiction-2026-09-23.csv` (downloaded in Step 1)
- Create: `trigger/ipc/csv.test.ts`
- Create: `trigger/ipc/csv.ts`

**Step 1: Add the fixture**

The original `~/Downloads/independentpresstop40fiction.csv` is **gone**. Pull a
fresh copy straight from the archive instead, and name the fixture for the week
you actually downloaded:

```bash
mkdir -p trigger/__fixtures__/ipc
# Resolves the file id from the week folder, then downloads the CSV.
# Verified working 2026-09-24. Swap FOLDER for another week's id if needed —
# Drive file ids are per-file and are NOT reused week to week.
node -e '
const FOLDER="1cSbaXAy3W1czJpJZKzcGEj5B3sTXm17b", WANT="independentpresstop40fiction.csv";
(async()=>{
  const h=await (await fetch(`https://drive.google.com/embeddedfolderview?id=${FOLDER}#list`)).text();
  const re=/file\/d\/([A-Za-z0-9_-]+)[^>]*>[\s\S]*?flip-entry-title">([^<]+)</g;
  const f=[...h.matchAll(re)].map(m=>({id:m[1],name:m[2].trim()})).find(x=>x.name===WANT);
  if(!f) throw new Error("csv not found in folder");
  process.stdout.write(await (await fetch(`https://drive.google.com/uc?export=download&id=${f.id}`)).text());
})();
' > trigger/__fixtures__/ipc/fiction-2026-09-23.csv
head -3 trigger/__fixtures__/ipc/fiction-2026-09-23.csv   # expect the header + 2 rows
```

A plain `curl | grep` will NOT work here: the file id and the filename sit on
opposite sides of several tags in the `embeddedfolderview` markup, so the match
has to span lines. (Tried and rejected — it returns Drive's HTTP 400 page.)

Then update the fixture path in the test below to match the file you saved.

**Step 2: Write the failing test**

```ts
// trigger/ipc/csv.test.ts
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

  // CONTENT-COUPLED but verified still true in the 2026-09-23 file (row 2 is
  // The Odyssey / "Homer, Emily Wilson (Transl.)"). If a fixture refresh breaks
  // it, re-point it at whichever row has a quoted comma rather than deleting it.
  it("handles quoted fields containing commas", () => {
    const rows = parseIpcCsv(fixture);
    expect(rows[1].author).toBe("Homer, Emily Wilson (Transl.)");
  });

  // CONTENT-COUPLED: rewrite this against whatever row your fixture actually
  // has. In the 2026-09-23 file row 5 is "The Birthing Tree" and carries no
  // trailing space. Assert the trimming behavior on a synthetic row instead,
  // so the test survives the next fixture refresh.
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
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run trigger/ipc/csv.test.ts`
Expected: FAIL — `Cannot find module './csv'`

**Step 4: Write the implementation**

```ts
// trigger/ipc/csv.ts
export interface IpcBookRow {
  rank: number;
  title: string;
  publisher: string;
  isbn: string;
  author: string;
}

const HEADER = ["Ranking", "Title", "Publisher", "ISBN", "Author"];

/** Minimal RFC-4180 field splitter: quoted fields may contain commas and "" escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function parseIpcCsv(text: string): IpcBookRow[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  const header = splitCsvLine(lines[0]).map(clean);
  if (header.join(",") !== HEADER.join(",")) {
    throw new Error(`Unexpected IPC CSV header: ${lines[0]}`);
  }
  const rows = lines.slice(1).map((line, i) => {
    const cells = splitCsvLine(line).map(clean);
    if (cells.length !== 5) {
      throw new Error(`Row ${i + 2}: expected 5 cells, got ${cells.length}`);
    }
    const [rankStr, title, publisher, isbn, author] = cells;
    const rank = Number(rankStr);
    if (!Number.isInteger(rank) || rank < 1) {
      throw new Error(`Row ${i + 2}: bad rank "${rankStr}"`);
    }
    if (!/^97[89]\d{10}$/.test(isbn)) {
      throw new Error(`Row ${i + 2}: bad ISBN "${isbn}"`);
    }
    return { rank, title, publisher, isbn, author };
  });
  rows.forEach((r, i) => {
    if (r.rank !== i + 1) throw new Error(`Non-sequential rank at row ${i + 2}`);
  });
  return rows;
}
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run trigger/ipc/csv.test.ts`
Expected: PASS (6 tests). Two tests are marked CONTENT-COUPLED above — if a fixture refresh breaks one, re-point it at the equivalent row rather than deleting the case.

**Step 6: Commit**

```bash
git add trigger/ipc/csv.ts trigger/ipc/csv.test.ts trigger/__fixtures__/ipc/fiction-2026-09-23.csv
git commit -m "feat(ipc): CSV parser for Independent Press Top 40 lists"
```

---

### Task 2: Drive archive client (`trigger/ipc/drive.ts`)

**Files:**
- Create: `trigger/ipc/drive.test.ts`
- Create: `trigger/ipc/drive.ts`

The pure functions (HTML parsing, week mapping) get tests; the two thin `fetch` wrappers do not (same convention as `trigger/aba/client.ts`).

**Step 1: Write the failing test**

```ts
// trigger/ipc/drive.test.ts
import { describe, it, expect } from "vitest";
import { parseFolderListing, parseFileListing, weekDateForFolderName, dedupeWeeks } from "./drive";

// Trimmed copy of real embeddedfolderview markup (verified 2026-09-02).
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run trigger/ipc/drive.test.ts`
Expected: FAIL — `Cannot find module './drive'`

**Step 3: Write the implementation**

```ts
// trigger/ipc/drive.ts
export const IPC_ARCHIVE_FOLDER_ID = "1QJawmDIsZWswQ2I5cMZzEjWPTFGOlUv3";

const listingUrl = (id: string) =>
  `https://drive.google.com/embeddedfolderview?id=${id}#list`;
export const downloadUrl = (id: string) =>
  `https://drive.google.com/uc?export=download&id=${id}`;

export interface DriveEntry { id: string; name: string; }

function parseEntries(html: string, kind: "folders" | "file/d"): DriveEntry[] {
  const re = new RegExp(
    `${kind}/([A-Za-z0-9_-]+)[^>]*>[\\s\\S]*?flip-entry-title">([^<]+)<`,
    "g"
  );
  const out: DriveEntry[] = [];
  for (const m of html.matchAll(re)) out.push({ id: m[1], name: m[2].trim() });
  return out;
}

export const parseFolderListing = (html: string) => parseEntries(html, "folders");
export const parseFileListing = (html: string) => parseEntries(html, "file/d");

/**
 * Folder names are M-D-YY, normally the publication Thursday (sales week ends
 * the prior Saturday; ABA's matching week_date is that Wednesday). A few early
 * folders drift off Thursday, so: take the most recent Wednesday STRICTLY
 * before the folder date. For a Thursday that is yesterday — the ABA
 * Wednesday of the same sales week.
 */
export function weekDateForFolderName(name: string): string | null {
  const m = name.match(/^(\d{1,2})-(\d{1,2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(2000 + +m[3], +m[1] - 1, +m[2]));
  do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() !== 3);
  return d.toISOString().slice(0, 10);
}

async function fetchListing(folderId: string): Promise<string> {
  const res = await fetch(listingUrl(folderId));
  if (!res.ok) throw new Error(`Drive listing failed: HTTP ${res.status}`);
  return res.text();
}

export interface ArchiveWeek extends DriveEntry {
  weekDate: string;
  hasCsvs: boolean;
}

/**
 * Two folders can resolve to the same week_date — `2-12-26` (Thursday) and
 * `2-15-26` (Sunday drift) both map to 2026-02-11. Prefer the folder that
 * actually has CSVs; if both do (or neither), take the later folder name so
 * the choice is deterministic and order-independent.
 */
export function dedupeWeeks<T extends { name: string; weekDate: string; hasCsvs: boolean }>(
  weeks: T[]
): T[] {
  const best = new Map<string, T>();
  for (const w of weeks) {
    const prev = best.get(w.weekDate);
    if (!prev) { best.set(w.weekDate, w); continue; }
    if (w.hasCsvs !== prev.hasCsvs) {
      if (w.hasCsvs) best.set(w.weekDate, w);
    } else if (w.name > prev.name) {
      best.set(w.weekDate, w);
    }
  }
  return [...best.values()];
}

/**
 * All archive week folders with their CSV availability, deduped by weekDate.
 * Costs one listing request per folder (~37 today) — acceptable for a weekly
 * cron and a one-shot backfill, and it is what makes dedupe correct.
 */
export async function listArchiveWeeks(): Promise<ArchiveWeek[]> {
  const html = await fetchListing(IPC_ARCHIVE_FOLDER_ID);
  const folders = parseFolderListing(html)
    .map((f) => ({ ...f, weekDate: weekDateForFolderName(f.name) }))
    .filter((f): f is DriveEntry & { weekDate: string } => f.weekDate !== null);

  const withCsvs: ArchiveWeek[] = [];
  for (const f of folders) {
    const files = parseFileListing(await fetchListing(f.id));
    const has = (n: string) => files.some((x) => x.name === n);
    withCsvs.push({
      ...f,
      hasCsvs:
        has("independentpresstop40fiction.csv") &&
        has("independentpresstop40nonfiction.csv"),
    });
  }
  return dedupeWeeks(withCsvs);
}

/** CSV file ids for one week folder; null when the folder has no CSVs (pre-April-2026). */
export async function fetchWeekCsvs(
  folderId: string
): Promise<{ fiction: string; nonfiction: string } | null> {
  const files = parseFileListing(await fetchListing(folderId));
  const find = (n: string) => files.find((f) => f.name === n)?.id;
  const fictionId = find("independentpresstop40fiction.csv");
  const nonfictionId = find("independentpresstop40nonfiction.csv");
  if (!fictionId || !nonfictionId) return null;
  const get = async (id: string) => {
    const res = await fetch(downloadUrl(id));
    if (!res.ok) throw new Error(`Drive download failed: HTTP ${res.status}`);
    return res.text();
  };
  return { fiction: await get(fictionId), nonfiction: await get(nonfictionId) };
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run trigger/ipc/drive.test.ts`
Expected: PASS (15 tests)

**Step 5: Live smoke test (one-off, not committed)**

Run: `npx tsx -e "import('./trigger/ipc/drive.ts').then(async d => { const w = await d.listArchiveWeeks(); console.log(w.length, w.slice(-2)); })"`
Expected (verified live 2026-09-24): **37 folders, 36 after dedupe, 33 with `hasCsvs: true`**, earliest `{ name: '1-29-26', weekDate: '2026-01-28' }`, latest `{ name: '9-24-26', weekDate: '2026-09-23' }`. The three with `hasCsvs: false` are `1-15-26`, `1-22-26`, `7-2-26`. No duplicate `weekDate` values may remain — that is the dedupe working. Expect these counts to have grown by one per Thursday since.
(If `tsx` is unavailable, verify equivalently with `npx vitest run` on a temporary test — do not add a network test to the suite.)

**Step 6: Commit**

```bash
git add trigger/ipc/drive.ts trigger/ipc/drive.test.ts
git commit -m "feat(ipc): keyless Drive archive client (embeddedfolderview + uc download)"
```

---

### Task 3: Persistence helpers (`trigger/ipc/persist.ts`)

**Files:**
- Create: `trigger/ipc/persist.test.ts`
- Create: `trigger/ipc/persist.ts`

**Step 1: Write the failing test**

```ts
// trigger/ipc/persist.test.ts
import { describe, it, expect } from "vitest";
import { toIpcDbRows, ipcContentHash, applyMomentum } from "./persist";
import type { IpcBookRow } from "./csv";

const book = (rank: number, isbn: string): IpcBookRow => ({
  rank, isbn, title: `T${rank}`, publisher: "P", author: "A",
});

describe("toIpcDbRows", () => {
  it("maps both categories to regional_bestsellers rows under region IPC", () => {
    const rows = toIpcDbRows("2026-09-02", [book(1, "9781000000001")], [book(1, "9781000000002")]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      region: "IPC", week_date: "2026-09-02", category: "FICTION",
      rank: 1, isbn: "9781000000001", price: null,
      last_week_rank: null, weeks_on_list: null,
      list_title: "Independent Press Top 40",
    });
    expect(rows[1].category).toBe("NONFICTION");
  });
});

describe("ipcContentHash", () => {
  it("is stable across calls and changes when content changes", () => {
    const a = toIpcDbRows("2026-09-02", [book(1, "9781000000001")], []);
    const b = toIpcDbRows("2026-09-02", [book(1, "9781000000009")], []);
    expect(ipcContentHash(a)).toBe(ipcContentHash(a));
    expect(ipcContentHash(a)).not.toBe(ipcContentHash(b));
  });
});

describe("applyMomentum", () => {
  it("fills last_week_rank from the prior week and weeks_on_list from history counts", () => {
    const rows = toIpcDbRows("2026-09-02", [book(1, "9781000000001"), book(2, "9781000000002")], []);
    applyMomentum(
      rows,
      [{ isbn: "9781000000001", category: "FICTION", rank: 5 }],
      new Map([["9781000000001", 12]])
    );
    expect(rows[0]).toMatchObject({ last_week_rank: 5, weeks_on_list: 13 });
    // New book: no prior rank, first week on list.
    expect(rows[1]).toMatchObject({ last_week_rank: null, weeks_on_list: 1 });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run trigger/ipc/persist.test.ts`
Expected: FAIL — `Cannot find module './persist'`

**Step 3: Write the implementation**

```ts
// trigger/ipc/persist.ts
import { createHash } from "node:crypto";
import type { DbRow } from "../aba/persist";
import type { IpcBookRow } from "./csv";

export const IPC_REGION = "IPC";
export const IPC_LIST_TITLE = "Independent Press Top 40";

function catRows(weekDate: string, category: string, books: IpcBookRow[]): DbRow[] {
  return books.map((b) => ({
    region: IPC_REGION,
    week_date: weekDate,
    category,
    rank: b.rank,
    isbn: b.isbn,
    title: b.title,
    author: b.author,
    publisher: b.publisher,
    price: null,
    last_week_rank: null,
    weeks_on_list: null,
    list_title: IPC_LIST_TITLE,
  }));
}

export function toIpcDbRows(
  weekDate: string,
  fiction: IpcBookRow[],
  nonfiction: IpcBookRow[]
): DbRow[] {
  return [
    ...catRows(weekDate, "FICTION", fiction),
    ...catRows(weekDate, "NONFICTION", nonfiction),
  ];
}

/** Hash of source content only (momentum fields are derived, so excluded). */
export function ipcContentHash(rows: DbRow[]): string {
  const canonical = rows
    .map((r) => [r.category, r.rank, r.isbn, r.title, r.author, r.publisher].join(" "))
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Mutates rows in place. prevRows: the prior IPC week's (isbn, category, rank).
 * historyCounts: distinct prior weeks per ISBN from the
 * get_weeks_on_list_batch_regional RPC (computed while this week's rows are
 * deleted, so the count excludes the current week).
 */
export function applyMomentum(
  rows: DbRow[],
  prevRows: Array<{ isbn: string; category: string | null; rank: number }>,
  historyCounts: Map<string, number>
): void {
  const prevRank = new Map(prevRows.map((r) => [`${r.category}|${r.isbn}`, r.rank]));
  for (const r of rows) {
    r.last_week_rank = prevRank.get(`${r.category}|${r.isbn}`) ?? null;
    r.weeks_on_list = (historyCounts.get(r.isbn) ?? 0) + 1;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run trigger/ipc/persist.test.ts`
Expected: PASS (6 tests)

**Step 5: Commit**

```bash
git add trigger/ipc/persist.ts trigger/ipc/persist.test.ts
git commit -m "feat(ipc): DB row mapping, content hash, and momentum computation"
```

---

### Task 4: Ingest tasks (`trigger/ingest-ipc.ts`)

**Files:**
- Create: `trigger/ingest-ipc.ts`

This file follows `trigger/ingest-bestsellers.ts` closely — read that file first.

Note `listArchiveWeeks()` (Task 2) now costs one request per folder (~37) because
it resolves CSV availability for the dedupe. The weekly cron calls it once per
tick; the backfill calls it once total. If that ever becomes a problem, cache the
listing for the run rather than reverting the dedupe. The helpers are already unit-tested; the task wiring is verified against dev (Step 3) rather than unit-tested, matching the existing convention.

**Step 1: Write the tasks**

```ts
// trigger/ingest-ipc.ts
import { schedules, task, logger } from "@trigger.dev/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicationWednesday } from "./aba/dates";
import { parseIpcCsv } from "./ipc/csv";
import { listArchiveWeeks, fetchWeekCsvs } from "./ipc/drive";
import { toIpcDbRows, ipcContentHash, applyMomentum, IPC_REGION } from "./ipc/persist";

function supabase(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

const cacheKeyFor = (weekDate: string) => `ipc_${weekDate}`;

export type IpcIngestStatus = "written" | "unchanged" | "unpublished" | "already_ingested";

/**
 * Ingest one IPC week from the public Drive archive.
 * Same replace-on-change + fetch_cache hash pattern as ingest-region-week.
 * IPC is NEVER written to weekly_scores: recalc.ts iterates the 9 ABA
 * REGION_SLUGS only, so review aggregates and feeds are untouched.
 */
export const ingestIpcWeek = task({
  id: "ingest-ipc-week",
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 30_000 },
  run: async (payload: { weekDate: string; skipIfIngested?: boolean }) => {
    const { weekDate, skipIfIngested } = payload;
    const db = supabase();
    const key = cacheKeyFor(weekDate);

    if (skipIfIngested) {
      const { data: existing } = await db
        .from("fetch_cache").select("cache_key").eq("cache_key", key).maybeSingle();
      if (existing) return { status: "already_ingested" as IpcIngestStatus, weekDate, rows: 0 };
    }

    const weeks = await listArchiveWeeks();
    const folder = weeks.find((w) => w.weekDate === weekDate);
    if (!folder) {
      logger.info("IPC week not in archive yet", { weekDate });
      return { status: "unpublished" as IpcIngestStatus, weekDate, rows: 0 };
    }
    // listArchiveWeeks already resolved CSV availability, so skip the second
    // folder listing for the known CSV-less weeks (1-15-26, 1-22-26, 7-2-26)
    // and any future one.
    if (!folder.hasCsvs) {
      logger.info("IPC folder exists but has no CSVs", { weekDate, folder: folder.name });
      return { status: "unpublished" as IpcIngestStatus, weekDate, rows: 0 };
    }
    const csvs = await fetchWeekCsvs(folder.id);
    if (!csvs) {
      // Raced with a folder edit between listing and fetch. Not an error.
      logger.info("IPC CSVs vanished between listing and fetch", { weekDate, folder: folder.name });
      return { status: "unpublished" as IpcIngestStatus, weekDate, rows: 0 };
    }

    const rows = toIpcDbRows(weekDate, parseIpcCsv(csvs.fiction), parseIpcCsv(csvs.nonfiction));
    const hash = ipcContentHash(rows);

    const { data: cached } = await db
      .from("fetch_cache").select("data").eq("cache_key", key).maybeSingle();
    if ((cached?.data as { hash?: string } | null)?.hash === hash) {
      return { status: "unchanged" as IpcIngestStatus, weekDate, rows: 0 };
    }

    // Delete BEFORE computing weeks_on_list so the RPC count excludes this week.
    const { error: delError } = await db
      .from("regional_bestsellers").delete()
      .eq("region", IPC_REGION).eq("week_date", weekDate);
    if (delError) throw new Error(`IPC delete failed for ${weekDate}: ${delError.message}`);

    const prevWeek = new Date(`${weekDate}T00:00:00Z`);
    prevWeek.setUTCDate(prevWeek.getUTCDate() - 7);
    const prevWeekDate = prevWeek.toISOString().slice(0, 10);
    const { data: prevRows, error: prevError } = await db
      .from("regional_bestsellers").select("isbn, category, rank")
      .eq("region", IPC_REGION).eq("week_date", prevWeekDate);
    if (prevError) throw new Error(`IPC prev-week query failed: ${prevError.message}`);

    const isbns = [...new Set(rows.map((r) => r.isbn))];
    const { data: counts, error: rpcError } = await db.rpc(
      "get_weeks_on_list_batch_regional",
      { isbn_list: isbns, target_region: IPC_REGION }
    );
    if (rpcError) throw new Error(`IPC weeks-on-list RPC failed: ${rpcError.message}`);
    const historyCounts = new Map<string, number>(
      (counts ?? []).map((c: { isbn: string; weeks_on_list: number }) => [c.isbn, c.weeks_on_list])
    );

    applyMomentum(rows, prevRows ?? [], historyCounts);

    const { error: insError } = await db.from("regional_bestsellers").insert(rows);
    if (insError) {
      // Week is now empty; hash NOT recorded, so the next run repairs it.
      throw new Error(`IPC insert failed for ${weekDate}: ${insError.message}`);
    }

    const { error: cacheError } = await db.from("fetch_cache").upsert(
      { cache_key: key, data: { hash, folderId: folder.id, ingestedAt: new Date().toISOString() } },
      { onConflict: "cache_key" }
    );
    if (cacheError) {
      logger.warn("IPC fetch_cache upsert failed (ingest succeeded)", { weekDate, error: cacheError.message });
    }

    logger.info("IPC ingested", { weekDate, rows: rows.length });
    return { status: "written" as IpcIngestStatus, weekDate, rows: rows.length };
  },
});

/**
 * Thursday polling cron (PT). The IPC email arrives Wednesday under a
 * Thursday embargo; the Drive archive folder usually exists by Wednesday.
 * Polling Thursday morning respects the embargo. skipIfIngested makes
 * post-landing ticks one fetch_cache read.
 */
export const ipcWeeklyIngest = schedules.task({
  id: "ipc-weekly-ingest",
  cron: { pattern: "0,30 6-11 * * 4", timezone: "America/Los_Angeles" },
  run: async () => {
    const weekDate = publicationWednesday();
    const r = await ingestIpcWeek.triggerAndWait({ weekDate, skipIfIngested: true });
    if (!r.ok) {
      logger.error("IPC weekly ingest failed", { weekDate, error: r.error });
      return { weekDate, status: "failed" };
    }
    logger.info("IPC weekly tick", { weekDate, status: r.output.status });
    return { weekDate, status: r.output.status };
  },
});

/**
 * One-shot backfill: every archive week with CSVs, oldest first so
 * last_week_rank / weeks_on_list build up correctly. Weeks already ingested
 * are skipped via skipIfIngested. Trigger manually from the dashboard.
 */
export const ipcBackfill = task({
  id: "ipc-backfill",
  run: async () => {
    // Deduped by listArchiveWeeks, so weekDate is unique and this sort is
    // unambiguous. Oldest first so last_week_rank / weeks_on_list build up.
    const weeks = (await listArchiveWeeks())
      .filter((w) => w.hasCsvs)
      .sort((a, b) => a.weekDate.localeCompare(b.weekDate));
    const results: Array<{ weekDate: string; status: string }> = [];
    for (const w of weeks) {
      const r = await ingestIpcWeek.triggerAndWait({ weekDate: w.weekDate, skipIfIngested: true });
      results.push({ weekDate: w.weekDate, status: r.ok ? r.output.status : "failed" });
    }
    logger.info("IPC backfill complete", { results });
    return { results };
  },
});
```

**Step 2: Type-check and run the full trigger test suite**

Run: `npx tsc -p tsconfig.json --noEmit 2>&1 | grep -i "ipc\|ingest-ipc"; npx vitest run trigger/`
Expected: no type errors in the new files; all trigger tests pass.

**Step 3: Verify in dev — DO THIS AFTER TASK 5**

> **Ordering:** this step writes a real IPC week into `regional_bestsellers`.
> Task 5's ABA allowlist must be merged first, or that single week leaks into
> Elsewhere and Unique Books exactly as a full backfill would — just quieter.
> Task 5 touches no database and needs no credentials, so do it first and come
> back. (Task 7 carries the same prerequisite for the same reason.)

Run `npx trigger.dev@latest dev`, then from the Trigger.dev dashboard Test page run `ingest-ipc-week` with `{ "weekDate": "2026-09-23" }` (the current publication Wednesday; `2026-09-02` also works).
Expected: status `written`, 80 rows. Then verify:

```sql
select category, count(*), min(rank), max(rank)
from regional_bestsellers where region = 'IPC' and week_date = '2026-09-23'
group by category;
-- FICTION 40 1 40 / NONFICTION 40 1 40
```

Re-running the same test immediately should return `unchanged` (the hash gate),
and re-running with `{"weekDate": "2026-07-01"}` should return `unpublished`
(a real CSV-less week) rather than erroring.

**Step 4: Commit**

```bash
git add trigger/ingest-ipc.ts
git commit -m "feat(ipc): weekly Thursday ingest, backfill task"
```

---

### Task 5: Fence IPC out of the ABA-only readers (prerequisite for backfill)

**Why this comes before the backfill:** `regional_bestsellers` is a shared table.
Task 4's isolation argument only proves IPC never reaches `weekly_scores`. Four
code paths read `regional_bestsellers` and assume every row is an ABA region —
they were written when that was true. Backfilling ~33 IPC weeks without this task
silently changes two working features.

| File | Current filter | What breaks |
|---|---|---|
| `src/services/elsewhereService.client.ts` (~line 120) | `.neq('region', targetRegion)` | IPC becomes a peer region in Elsewhere |
| `supabase/functions/fetch-elsewhere-books/index.ts` (~line 190) | `.neq('region', filters.targetRegion)` | same, server-side |
| `src/services/uniqueBooksService.ts` (~line 113) | **none** | region-unique books stop looking unique |
| `src/hooks/useRegionalHistory.ts` (~line 33) | **none** | IPC renders as a 10th region on the book-detail heat map |

`trigger/generate-elsewhere-feeds.ts` is already safe — it uses
`.in("region", comparisonRegions)`, an allowlist.

**Files:**
- Create: `src/config/abaRegions.ts`
- Create: `src/config/abaRegions.test.ts`
- Modify: the four files in the table above

**Step 1: The allowlist, derived — not a second hardcoded list**

```ts
// src/config/abaRegions.ts
import { REGIONS } from './regions';

/**
 * The region codes that represent ABA regional bestseller lists.
 *
 * `regional_bestsellers` also holds non-ABA pseudo-regions (currently 'IPC',
 * the Independent Press Top 40). Any query that means "the ABA regions" must
 * filter with this list rather than with `.neq('region', target)` or no filter
 * at all, both of which silently absorb every pseudo-region we ever add.
 */
export const ABA_REGION_CODES: string[] = REGIONS.map((r) => r.abbreviation);

/** Pseudo-regions stored in regional_bestsellers that are NOT ABA lists. */
export const NON_ABA_REGION_CODES = ['IPC'] as const;
```

**Step 2: Write the failing test**

```ts
// src/config/abaRegions.test.ts
import { describe, it, expect } from 'vitest';
import { ABA_REGION_CODES, NON_ABA_REGION_CODES } from './abaRegions';

describe('ABA_REGION_CODES', () => {
  it('covers the nine ABA regions', () => {
    expect(ABA_REGION_CODES).toHaveLength(9);
    expect(ABA_REGION_CODES).toContain('PNBA');
    expect(ABA_REGION_CODES).toContain('CALIBAN');
  });

  it('excludes every non-ABA pseudo-region', () => {
    for (const code of NON_ABA_REGION_CODES) {
      expect(ABA_REGION_CODES).not.toContain(code);
    }
  });
});
```

Run: `npx vitest run src/config/abaRegions.test.ts` — FAIL (`Cannot find module './abaRegions'`), then PASS once Step 1 lands.

**Step 3: Apply the allowlist to all four readers**

In each, add the region filter. Elsewhere client and edge function keep their
`.neq(...)` (it still excludes the region you are viewing) and gain an allowlist:

```ts
.neq('region', targetRegion)
.in('region', ABA_REGION_CODES)     // add: keeps IPC and future pseudo-regions out
```

`uniqueBooksService.ts` (the past-year region map) and `useRegionalHistory.ts`
have no region filter at all; add `.in('region', ABA_REGION_CODES)` to both.

The edge function cannot import from `src/`. Inline the same list there with a
comment pointing back at `src/config/abaRegions.ts` so the duplication is
visible, and assert in its own test (or a comment) that the two stay in sync.

**Step 4: Regression test — the fence actually holds**

Add to `src/services/uniqueBooksService.test.ts` (or create it) a case proving
an IPC row does not count toward a book's region set. Use the existing Supabase
mock-builder pattern — chainable and thenable, as the other service tests do.
The test must fail if the `.in('region', ...)` is removed.

**Step 5: Verify**

Run: `npx vitest run src/` — all green.
Then, with at least one IPC week ingested (Task 4 Step 3), load the Elsewhere
and Unique tabs for PNBA and confirm no IPC-only title appears in either, and
that a book on both a PNBA list and the IPC list still shows only ABA regions
on its detail heat map.

**Step 6: Commit**

```bash
git add src/config/abaRegions.ts src/config/abaRegions.test.ts \
  src/services/elsewhereService.client.ts src/services/uniqueBooksService.ts \
  src/hooks/useRegionalHistory.ts supabase/functions/fetch-elsewhere-books/index.ts
git commit -m "fix(regions): fence non-ABA pseudo-regions out of Elsewhere and Unique"
```

---

### Task 6: `/indie-press` page + nav

**Files:**
- Create: `src/pages/IndiePress.tsx`
- Modify: `src/App.tsx` (add route beside `/about`, line ~118)
- Modify: main navigation (find with `grep -n "About" src/components/Navigation/MainNav.tsx src/components/Navigation/MobileNav.tsx`) — add an "Indie Press" link to `/indie-press` in both.

`fetchBestsellerListFromDb({ region: 'IPC' })` (in `src/services/bestsellerApi.ts`) already resolves the latest IPC week, assembles categories, and computes rank changes — reuse it. `BookListDisplay` renders a `BestsellerList` with filtering; pass neutral filter props.

**Step 1: Write the page**

```tsx
// src/pages/IndiePress.tsx
import { useQuery } from "@tanstack/react-query";
import { fetchBestsellerListFromDb } from "@/services/bestsellerApi";
import { BookListDisplay } from "@/components/BookListDisplay";
import { LoadingState, ErrorState } from "@/components/ui/status";
import { formatDisplayDate } from "@/utils/dateUtils"; // verify export name; grep dateUtils for the display formatter used by Index

const CATEGORY_LABELS: Record<string, string> = {
  FICTION: "Fiction",
  NONFICTION: "Nonfiction",
};

export default function IndiePress() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["ipcList"],
    queryFn: () => fetchBestsellerListFromDb({ region: "IPC" }),
    staleTime: 30 * 60 * 1000,
  });

  if (isLoading) return <LoadingState title="Loading Independent Press Top 40..." />;
  if (error || !data) {
    return (
      <ErrorState
        title="Failed to load the Independent Press Top 40"
        description={error instanceof Error ? error.message : "Unknown error"}
        onRetry={() => refetch()}
      />
    );
  }

  const display = {
    ...data.current,
    title: "Independent Press Top 40",
    categories: data.current.categories.map((c) => ({
      ...c,
      name: CATEGORY_LABELS[c.name] ?? c.name,
    })),
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Independent Press Top 40</h1>
        <p className="text-muted-foreground">
          National bestsellers from independent publishers, week of {formatDisplayDate(data.weekDate)}
        </p>
        <p className="text-sm text-muted-foreground">
          Published weekly by the{" "}
          <a href="https://www.indiepubs.org/top40" target="_blank" rel="noopener noreferrer" className="underline">
            Independent Publishers Caucus
          </a>
        </p>
      </div>
      <BookListDisplay
        bestsellerData={display}
        filter="all"
        audienceFilter="all"
        searchTerm=""
        bookAudiences={{}}
        isPbnStaff={false}
        onSwitchingDataClear={() => {}}
      />
    </div>
  );
}
```

Notes for the implementer — all three resolved during execution:
- Neutral filter values are `'all'` for both `filter` and `audienceFilter` (`matchesAddDropFilter` in `src/utils/bookFilters.ts` short-circuits on it).
- **There is no `formatDisplayDate`.** `src/utils/dateUtils.ts` exports a `DateUtils` class with no display formatter, and `Index.tsx` just renders `bestsellerData.date` raw. The page formats `weekDate` locally with `toLocaleDateString`, pinning to local midnight first — `new Date('2026-09-23')` is UTC midnight and renders as the 22nd anywhere west of Greenwich.
- Chrome: `/about` sits outside `Layout` and builds its own header (logo home-link + `ThemeToggle`) plus `Footer`. `/indie-press` mirrors that, which is right — there is no region to select.
- **The "not ingested yet" state needs its own branch.** `fetchBestsellerListFromDb` throws for a region with no rows, exactly as it does for a real outage, so a naive page shows an alarming red error box until the backfill runs. Detect that specific message, render a neutral `EmptyState`, and disable react-query's retry for it — the app's default `retry: 2` also makes `isLoading` flicker false between attempts, so gate on `isPending` or the page renders a bogus "Unknown error" mid-retry.

**Step 2: Add the route**

In `src/App.tsx` beside the `/about` route:

```tsx
<Route path="/indie-press" element={<IndiePress />} />
```

(plus the lazy/direct import matching how `About` is imported).

**Step 3: Add nav links** in both `MainNav` and `MobileNav`.

There is **no About link in either nav** to mirror — the only nav group is the
region toggle `Current | Elsewhere | Unique`. Do NOT add Indie Press to that
toggle: it switches views *within* the selected region, while `/indie-press`
leaves region context entirely and renders its own chrome, so a fourth segment
would make the whole nav vanish on click. Add it as a separate quiet link
beside the toggle group (and below it on mobile), active-styled off
`location.pathname.startsWith('/indie-press')`.

**Step 4: Verify**

Run: `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep -i indiepress` (expect nothing) and `npm run build` (expect success).
Then `npm run dev`, visit `http://localhost:8080/indie-press` (this project's dev port is 8080, not Vite's default) (Task 4 Step 3 must have ingested at least one week): both lists render 40 rows; with two consecutive weeks ingested, rank-change arrows appear.

**Step 5: Commit**

```bash
git add src/pages/IndiePress.tsx src/App.tsx src/components/Navigation/
git commit -m "feat(ipc): /indie-press page showing the Independent Press Top 40"
```

---

### Task 7: Backfill production + verify

**Step 1: Deploy** — `npx trigger.dev@latest deploy` (or the project's existing deploy flow; check `package.json` scripts). Confirm `ipc-weekly-ingest` appears with the Thursday schedule in the dashboard.

**Prerequisite:** Task 5 must be merged and deployed. Backfilling before the
ABA allowlist lands changes Elsewhere and Unique Books for every region.

**Step 2: Run backfill** — trigger `ipc-backfill` from the dashboard with payload `{}`.
Expected, as surveyed live 2026-09-24 (add one week per Thursday since):
**33 weeks `written`**, earliest `2026-01-28`, and exactly **three `unpublished`** —
`1-15-26`, `1-22-26`, `7-2-26`. `unpublished` means the folder has no
CSVs; it is the correct outcome, not a failure. Note `7-2-26` sits mid-season, so
an `unpublished` in the middle of the range is expected, not a sign of a broken run.

**Step 3: Verify data**

```sql
select count(distinct week_date) as weeks,
       min(week_date) as first, max(week_date) as last
from regional_bestsellers where region = 'IPC';
-- 33 weeks, first = 2026-01-28, last = current publication Wednesday
-- (one row per Thursday elapsed since the 2026-09-24 survey)

select count(*) from regional_bestsellers
where region = 'IPC' and week_date = (select max(week_date) from regional_bestsellers where region='IPC')
  and last_week_rank is not null;
-- > 0 (momentum populated)
```

**Step 4: Verify isolation** — aggregates AND the direct readers:

```sql
select count(*) from weekly_scores where region = 'IPC';  -- MUST be 0

-- IPC rows exist but are fenced off from the ABA readers (Task 5)
select region, count(*) from regional_bestsellers
where week_date >= '2026-09-01' group by region order by region;
-- IPC present alongside the 9 ABA codes; that is expected
```

Then in the browser, all three must be unchanged from before the backfill:
- `/review/2026` — numbers identical
- Elsewhere tab for PNBA — no IPC-only titles
- Unique tab for PNBA — count unchanged (this is the one Task 5 protects; if it
  dropped, the `.in('region', ABA_REGION_CODES)` in `uniqueBooksService.ts` is missing)

**Step 5: Commit any fixups; done.**

---

### Deferred (explicitly out of scope — YAGNI)

- **The three CSV-less weeks** — `2026-01-14`, `2026-01-21`, `2026-07-01` — would need PDF/JPG parsing. Everything from `2026-01-28` on has CSVs and is now IN scope (the original plan wrongly deferred all of Jan–Mar).
- **Book-detail IPC badge / cross-referencing** ("this regional bestseller is also IPC Top 40 #N") — natural follow-on once data has accumulated; needs a per-ISBN IPC query + badge component.
- **Email-based Wednesday ingestion** — would require embargo gating; the Thursday Drive fetch is simpler and sufficient.
- **IPC in Year-in-Review** — intentionally excluded from scoring; revisit only if a dedicated IPC year-end view is wanted.
