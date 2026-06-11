import { logger } from "@trigger.dev/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

const BOOKWEB_REGIONAL_URL =
  "https://www.bookweb.org/indiebound/bestsellers/regional";

/**
 * Hard-coded mapping for CALIBA regions whose link text doesn't follow the
 * "Full Name (ABBR)" pattern.  The bookweb page splits the CALIBA labels
 * across multiple `<font>` tags so the concatenated text reads e.g.
 * "Northern CALIBA" or "Southern CALIBA".
 */
const CALIBA_MAP: Record<string, string> = {
  "Northern CALIBA": "CALIBAN",
  "Southern CALIBA": "CALIBAS",
};

/**
 * Scrape the bookweb.org regional bestsellers page and return Google Drive
 * download URLs keyed by region abbreviation.
 *
 * Only matches links to `drive.google.com/file/d/{ID}/view` — folder links
 * (e.g. National Book Foundation) are excluded.
 */
export async function scrapeGoogleDriveUrls(): Promise<{
  urls: Record<string, string>;
  weekEndDate: string | null;
}> {
  const response = await fetch(BOOKWEB_REGIONAL_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch bookweb regional page: HTTP ${response.status}`
    );
  }

  const html = await response.text();
  return parseGoogleDriveUrls(html);
}

/**
 * Parse the HTML from the bookweb.org regional page and extract Google Drive
 * download URLs per region.  Exported for unit testing.
 */
export function parseGoogleDriveUrls(html: string): {
  urls: Record<string, string>;
  weekEndDate: string | null;
} {
  const urls: Record<string, string> = {};

  // Extract week-end date from page text like "Sales Week Ended Sunday, June 1, 2025"
  const weekDateMatch = html.match(
    /Sales\s+Week\s+Ended\s+\w+,\s+(\w+\s+\d{1,2},\s+\d{4})/i
  );
  const weekEndDate = weekDateMatch ? weekDateMatch[1] : null;

  // Match <a> tags whose href points to a Google Drive *file* (not folder)
  const linkRegex =
    /<a\s[^>]*href="(https:\/\/drive\.google\.com\/file\/d\/([^/]+)\/view[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const fileId = match[2];
    const innerHtml = match[3];

    // Strip all HTML tags to get plain text
    const text = innerHtml.replace(/<[^>]+>/g, "").trim();
    if (!text) continue;

    const abbreviation = mapTextToAbbreviation(text);
    if (!abbreviation) {
      logger.warn(`Could not map bookweb link text to region: "${text}"`);
      continue;
    }

    // Convert view URL to direct download URL
    urls[abbreviation] =
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
  }

  return { urls, weekEndDate };
}

/**
 * Map the visible link text to a region abbreviation.
 *
 * CALIBA links have non-standard text ("Northern CALIBA" / "Southern CALIBA")
 * so we check a hard-coded map first.  All other regions use the pattern
 * "Full Name (ABBR)" — we extract the abbreviation from the parentheses.
 */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Convert a week-end date string like "June 7, 2026" (typically a Sunday)
 * to the corresponding Wednesday publication date as "YYYY-MM-DD".
 *
 * The bookweb.org page shows "Sales Week Ended Sunday, June 7, 2026".
 * Bestseller files are published on Wednesday, which is 3 days before the
 * following Sunday — i.e. the Wednesday of the same ISO week. We subtract
 * (day-of-week + 4) % 7 days to land on Wednesday regardless of the input day.
 */
export function wednesdayFromWeekEndDate(weekEndDateStr: string): string {
  const match = weekEndDateStr.match(/(\w+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) throw new Error(`Cannot parse week-end date: "${weekEndDateStr}"`);

  const monthIndex = MONTH_NAMES.indexOf(match[1]);
  if (monthIndex === -1) throw new Error(`Unknown month: "${match[1]}"`);

  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // Build date in local time (noon to avoid DST edge cases)
  const date = new Date(year, monthIndex, day, 12, 0, 0);

  // Move to the most recent Wednesday (day 3)
  const dow = date.getDay(); // 0=Sun
  const diff = dow >= 3 ? dow - 3 : dow + 4;
  date.setDate(date.getDate() - diff);

  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Persist scraped Google Drive URLs to `fetch_cache` so they survive across weeks.
 * Cache key: `drive_urls_YYYY-MM-DD` where the date is the Wednesday publication date.
 */
export async function cacheDriveUrls(
  scrapeResult: { urls: Record<string, string>; weekEndDate: string | null },
  supabaseClient: SupabaseClient
): Promise<void> {
  if (!scrapeResult.weekEndDate || Object.keys(scrapeResult.urls).length === 0) {
    logger.warn("cacheDriveUrls: skipping — no weekEndDate or empty urls");
    return;
  }

  const wednesday = wednesdayFromWeekEndDate(scrapeResult.weekEndDate);
  const cacheKey = `drive_urls_${wednesday}`;

  const { error } = await supabaseClient.from("fetch_cache").upsert(
    {
      cache_key: cacheKey,
      data: {
        urls: scrapeResult.urls,
        weekEndDate: scrapeResult.weekEndDate,
        scrapedAt: new Date().toISOString(),
      },
    },
    { onConflict: "cache_key" }
  );

  if (error) {
    logger.warn("cacheDriveUrls: upsert failed", { error: error.message, cacheKey });
  } else {
    logger.info("cacheDriveUrls: cached Drive URLs", { cacheKey, regionCount: Object.keys(scrapeResult.urls).length });
  }
}

function mapTextToAbbreviation(text: string): string | null {
  // Check CALIBA special cases first
  for (const [label, abbr] of Object.entries(CALIBA_MAP)) {
    if (text.includes(label)) return abbr;
  }

  // Standard pattern: "Some Association Name (ABBR)"
  const parenMatch = text.match(/\(([A-Z]{3,6})\)/);
  if (parenMatch) return parenMatch[1];

  return null;
}
