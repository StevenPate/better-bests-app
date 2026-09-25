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
