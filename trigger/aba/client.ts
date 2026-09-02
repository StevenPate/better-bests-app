import { dbCategoryForTab, dbRegionForSlug, SKIP } from "./maps";
import { parseWorkbook } from "./workbook";
import { rowsFromCells, type AbaBookRow } from "./rows";
import { assertReportMatches } from "./reportDetails";

const SHORTLINK_BASE = "https://abaorg.link";
const SHEETS_BASE = "https://docs.google.com/spreadsheets/d";
const REPORT_DETAILS = "report details";

export function sheetUrls(slug: string, weekDate: string) {
  return {
    shortlink: `${SHORTLINK_BASE}/${slug}-bestsellers-sheet-${weekDate}`,
    xlsx: (id: string) => `${SHEETS_BASE}/${id}/export?format=xlsx`,
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
  /** Test seam: transform the enumerated tab list before mapping. */
  _tabFilter?: (tabs: string[]) => string[];
  /** Excuse an UNPARSEABLE Report Details date (2026-03-25 glitch). */
  allowUnparseableReportDate?: boolean;
}

/**
 * Download one region-week: resolve the shortlink, fetch the single xlsx
 * workbook, validate it is the region and week we asked for, and convert
 * every mapped tab. All data comes from the one file — per-tab CSV endpoints
 * were rejected because gviz silently serves the wrong tab for some names.
 */
export async function fetchRegionWeek(
  slug: string,
  weekDate: string,
  opts: Options = {}
): Promise<RegionWeek | null> {
  const dbRegion = dbRegionForSlug(slug);
  if (!dbRegion) throw new Error(`Unknown region slug: ${slug}`);

  const sheetId = await resolveSheetId(slug, weekDate);
  if (!sheetId) return null; // not published yet

  const res = await fetch(sheetUrls(slug, weekDate).xlsx(sheetId));
  if (!res.ok) {
    throw new Error(`xlsx download failed for ${slug} ${weekDate}: HTTP ${res.status}`);
  }
  const tabs = parseWorkbook(new Uint8Array(await res.arrayBuffer()));

  // 1. Validate the workbook is the week and region we asked for BEFORE
  //    reading any data. This is the week-shift guard.
  const reportTab = [...tabs.keys()].find(
    (t) => t.trim().toLowerCase() === REPORT_DETAILS
  );
  if (!reportTab) {
    throw new Error(`Workbook for ${slug} ${weekDate} has no Report Details tab`);
  }
  assertReportMatches(tabs.get(reportTab)!, dbRegion, weekDate, {
    allowUnparseableReportDate: opts.allowUnparseableReportDate,
  });

  // 2. Resolve every tab before converting anything, so an unknown tab
  //    aborts the region rather than half-ingesting it.
  const tabNames = opts._tabFilter ? opts._tabFilter([...tabs.keys()]) : [...tabs.keys()];
  const planned: Array<{ tab: string; category: string }> = [];
  for (const tab of tabNames) {
    const category = dbCategoryForTab(tab);
    if (category === null) {
      throw new Error(
        `Unrecognized sheet tab: "${tab}" for ${slug} ${weekDate}. ` +
          `ABA may have added or renamed a category — update trigger/aba/maps.ts.`
      );
    }
    if (category !== SKIP) planned.push({ tab, category });
  }

  // 3. Convert each mapped tab.
  const byCategory = new Map<string, AbaBookRow[]>();
  for (const { tab, category } of planned) {
    byCategory.set(category, rowsFromCells(tabs.get(tab) ?? []));
  }

  return { slug, dbRegion, weekDate, sheetId, byCategory };
}
