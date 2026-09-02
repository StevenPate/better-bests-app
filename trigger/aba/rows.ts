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

/**
 * ABA's workbooks carry ~50-deep internal lists, but the published lists —
 * and every score in our history (calculateScore keys on list size) — are
 * top 15. Ingest only the published portion; the deeper data stays in ABA's
 * sheets if ever wanted.
 */
const MAX_RANK = 15;

function headerIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (key) idx[key] = i;
  });
  // Observed glitch (MIBA 2026-08-19): a workbook shipped with the Rank
  // header cell blank while the rank values were present. Column 0 is Rank
  // in every ABA layout, so tolerate exactly that — an unlabeled first
  // column with no competing claim. Everything else still fails loudly.
  if (!("rank" in idx) && (header[0] ?? "").trim() === "") {
    idx.rank = 0;
  }
  for (const col of REQUIRED) {
    if (!(col in idx)) {
      throw new Error(`Sheet tab is missing required column: "${col}"`);
    }
  }
  return idx;
}

/**
 * xlsx numbers arrive as float text ("1.0", "9.780063511637E12"). ISBN-13s
 * are 13 significant digits — inside float64's exact-integer range, so
 * toFixed(0) recovers them losslessly. Anything that doesn't validate as an
 * ISBN-13 afterward is rejected by the caller.
 */
function isbnFromCell(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return "";
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return trimmed;
  return n.toFixed(0);
}

/** Blank or non-numeric becomes null rather than 0. */
function optionalInt(raw: string | undefined): number | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "" || trimmed.toLowerCase() === "new") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Text fields normally pass through, but a purely-numeric value (the title
 * "1984", say) is stored by Google as a number cell and arrives as float
 * text ("1984.0"). Recover the natural rendering.
 */
function textFromCell(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (/^-?\d+(\.\d+)?(E[+-]?\d+)?$/i.test(trimmed)) {
    const n = Number(trimmed);
    if (Number.isFinite(n)) {
      return Number.isInteger(n) ? n.toFixed(0) : String(n);
    }
  }
  return trimmed;
}

/** Price arrives as a bare number ("30.0"); the DB stores "$30.00". */
function priceFromCell(raw: string | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return trimmed; // already a display string
  return `$${n.toFixed(2)}`;
}

/** Convert one parsed tab (header row + data rows) into book rows. */
export function rowsFromCells(cells: string[][]): AbaBookRow[] {
  if (cells.length === 0) return [];
  const idx = headerIndex(cells[0]);
  const out: AbaBookRow[] = [];

  for (const row of cells.slice(1)) {
    const isbn = isbnFromCell(row[idx.isbn]);
    // ABA occasionally emits placeholder or blank ISBNs. regional_bestsellers
    // keys on ISBN, so a row without a real one is unusable.
    if (!/^97[89]\d{10}$/.test(isbn)) continue;

    const rank = optionalInt(row[idx.rank]);
    if (rank === null || rank > MAX_RANK) continue;

    out.push({
      rank,
      isbn,
      title: textFromCell(row[idx.title]),
      author: textFromCell(row[idx.author]),
      publisher: textFromCell(row[idx.publisher]) || null,
      price: priceFromCell(row[idx.price]),
      last_week_rank: optionalInt(row[idx["last week"]]),
      weeks_on_list: optionalInt(row[idx["weeks on list"]]),
    });
  }
  return out;
}
