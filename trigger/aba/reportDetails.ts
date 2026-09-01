export interface ReportDetails {
  label: string;
  weekDate: string; // ISO YYYY-MM-DD
}

/** Excel's day 0 is 1899-12-30. */
function fromExcelSerial(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + serial * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Read the "Report Details" tab: row 1 is the label ("PNBA Bestsellers"),
 * row 2 the week date — an Excel serial in the xlsx (float text like
 * "46260.0"), or MM/DD/YYYY if ABA ever switches to a text cell.
 */
export function parseReportDetails(cells: string[][]): ReportDetails {
  const label = (cells[0]?.[0] ?? "").trim();
  const rawDate = (cells[1]?.[0] ?? "").trim();

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
  cells: string[][],
  expectedDbRegion: string,
  expectedWeekDate: string
): void {
  const { label, weekDate } = parseReportDetails(cells);

  if (weekDate !== expectedWeekDate) {
    throw new Error(
      `Report Details week date mismatch: sheet says ${weekDate}, expected ${expectedWeekDate}`
    );
  }

  // The label uses ABA's region naming ("PNBA Bestsellers" — all nine labels
  // verified live 2026-08-31). For the two California regions our DB code
  // differs from ABA's slug, so compare against the ABA-side name.
  const labelRegion = label.split(/\s+/)[0]?.toUpperCase() ?? "";
  const expected = expectedDbRegion.toUpperCase();
  const CALIFORNIA: Record<string, string> = { CALIBAN: "NCIBA", CALIBAS: "SCIBA" };
  const acceptable = CALIFORNIA[expected] ?? expected;

  if (labelRegion !== acceptable) {
    throw new Error(
      `Report Details region mismatch: sheet says "${label}", expected ${acceptable}`
    );
  }
}
