export function getMostRecentWednesday(date?: Date): Date {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay();
  const diff = day >= 3 ? day - 3 : day + 4;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatAsYYMMDD(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

export function formatAsISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[-\s]/g, '');
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Given a "week ended" Sunday date string (e.g. "June 14, 2026"), return the
 * ISO date of the *following* Wednesday — the publication day for that list.
 * This Wednesday is also the date that appears in the legacy bookweb.org
 * file naming convention (e.g. `260617pn.txt` for the list ending June 14).
 *
 * Returns null if the input can't be parsed.
 */
export function wednesdayFromSundayWeekEnd(weekEndDateStr: string): string | null {
  const match = weekEndDateStr.match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) return null;
  const monthIndex = MONTH_NAMES.indexOf(match[1]);
  if (monthIndex === -1) return null;
  const date = new Date(
    parseInt(match[3], 10),
    monthIndex,
    parseInt(match[2], 10),
    12, 0, 0,
  );
  const dow = date.getDay();
  // Sunday (0) → +3, Mon (1) → +2, Tue (2) → +1, Wed (3) → 0,
  // Thu (4) → +6, Fri (5) → +5, Sat (6) → +4
  const diff = dow <= 3 ? 3 - dow : 10 - dow;
  date.setDate(date.getDate() + diff);
  return formatAsISO(date);
}
