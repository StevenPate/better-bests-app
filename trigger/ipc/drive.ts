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

const FICTION_CSV = "independentpresstop40fiction.csv";
const NONFICTION_CSV = "independentpresstop40nonfiction.csv";

/**
 * Filenames are not stable. Most weeks use the canonical names above, but a
 * re-export from Google Sheets produces e.g.
 * "independentpresstop40fiction - Sheet1 (2).csv" (real: folder 7-9-26), and
 * exact-name matching silently drops that week from the archive.
 *
 * So: match on the category prefix + .csv, preferring the canonical name when
 * both are present. The prefixes are distinct — "...top40nonfiction" does not
 * start with "...top40fiction" — so anchoring at the start keeps the two
 * categories from ever colliding.
 */
const csvMatcher = (stem: string) =>
  new RegExp(`^${stem.replace(/\.csv$/, "")}[^/]*\\.csv$`, "i");

function pickCsv(files: DriveEntry[], canonical: string): string | undefined {
  const exact = files.find((f) => f.name.toLowerCase() === canonical);
  if (exact) return exact.id;
  const re = csvMatcher(canonical);
  const matches = files.filter((f) => re.test(f.name));
  if (matches.length === 0) return undefined;
  // Shortest name is the closest to canonical, and makes the pick deterministic.
  matches.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  return matches[0].id;
}

/** The fiction/nonfiction CSV ids in a folder, or null when either is missing. */
export function findCsvIds(
  files: DriveEntry[]
): { fiction: string; nonfiction: string } | null {
  const fiction = pickCsv(files, FICTION_CSV);
  const nonfiction = pickCsv(files, NONFICTION_CSV);
  if (!fiction || !nonfiction) return null;
  return { fiction, nonfiction };
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
    withCsvs.push({ ...f, hasCsvs: findCsvIds(files) !== null });
  }
  return dedupeWeeks(withCsvs);
}

/** CSV text for one week folder; null when the folder has no CSVs. */
export async function fetchWeekCsvs(
  folderId: string
): Promise<{ fiction: string; nonfiction: string } | null> {
  const ids = findCsvIds(parseFileListing(await fetchListing(folderId)));
  if (!ids) return null;
  const { fiction: fictionId, nonfiction: nonfictionId } = ids;
  const get = async (id: string) => {
    const res = await fetch(downloadUrl(id));
    if (!res.ok) throw new Error(`Drive download failed: HTTP ${res.status}`);
    return res.text();
  };
  return { fiction: await get(fictionId), nonfiction: await get(nonfictionId) };
}
