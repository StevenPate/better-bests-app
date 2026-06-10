/**
 * Scrapes bookweb.org regional bestsellers page to discover Google Drive
 * download URLs for each region's bestseller file.
 *
 * Returns JSON: { urls: Record<string, string>, weekEndDate: string | null }
 *
 * This is needed because the frontend can't scrape bookweb.org directly
 * due to CORS restrictions.
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BOOKWEB_REGIONAL_URL =
  "https://www.bookweb.org/indiebound/bestsellers/regional";

const CALIBA_MAP: Record<string, string> = {
  "Northern CALIBA": "CALIBAN",
  "Southern CALIBA": "CALIBAS",
};

function mapTextToAbbreviation(text: string): string | null {
  for (const [label, abbr] of Object.entries(CALIBA_MAP)) {
    if (text.includes(label)) return abbr;
  }
  const parenMatch = text.match(/\(([A-Z]{3,6})\)/);
  if (parenMatch) return parenMatch[1];
  return null;
}

function parseGoogleDriveUrls(html: string): {
  urls: Record<string, string>;
  weekEndDate: string | null;
} {
  const urls: Record<string, string> = {};

  const weekDateMatch = html.match(
    /Sales\s+Week\s+Ended\s+\w+,\s+(\w+\s+\d{1,2},\s+\d{4})/i
  );
  const weekEndDate = weekDateMatch ? weekDateMatch[1] : null;

  const linkRegex =
    /<a\s[^>]*href="(https:\/\/drive\.google\.com\/file\/d\/([^/]+)\/view[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const fileId = match[2];
    const innerHtml = match[3];
    const text = innerHtml.replace(/<[^>]+>/g, "").trim();
    if (!text) continue;

    const abbreviation = mapTextToAbbreviation(text);
    if (!abbreviation) continue;

    urls[abbreviation] =
      `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
  }

  return { urls, weekEndDate };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const response = await fetch(BOOKWEB_REGIONAL_URL, {
      headers: { "User-Agent": "Better-Bestsellers/1.0" },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch bookweb.org: HTTP ${response.status}`);
    }

    const html = await response.text();
    const result = parseGoogleDriveUrls(html);

    console.log(
      `Scraped ${Object.keys(result.urls).length} Google Drive URLs, weekEndDate: ${result.weekEndDate}`
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Scrape error:", err.message);

    return new Response(
      JSON.stringify({ error: err.message, urls: {}, weekEndDate: null }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
