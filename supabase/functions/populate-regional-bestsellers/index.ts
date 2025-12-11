/**
 * Populate Regional Bestsellers Edge Function
 *
 * Fetches bestseller lists from all regions and populates the regional_bestsellers table.
 * This function should be run weekly to keep the Elsewhere discovery feature up-to-date.
 *
 * AUTHENTICATION:
 * - This function can be invoked with the ANON key (public access)
 * - Internally uses SERVICE_ROLE_KEY (from env) for database writes
 * - RLS policies allow authenticated writes to regional_bestsellers
 * - No elevated credentials needed for function invocation
 *
 * Usage:
 * - Manual: POST to /functions/v1/populate-regional-bestsellers
 *   curl -X POST https://<project>.supabase.co/functions/v1/populate-regional-bestsellers \
 *     -H "Authorization: Bearer <ANON_KEY>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"weekDate": "2025-11-06"}'
 *
 * - Scheduled: Via Supabase cron (weekly on Wednesdays after lists are published)
 *   See README.md for cron setup with Authorization header
 *
 * Payload:
 * {
 *   "weekDate": "2025-11-06",  // Optional: defaults to most recent Wednesday
 *   "regions": ["PNBA", "SIBA", "GLIBA"],  // Optional: defaults to all active regions
 *   "weeks": 1,  // Optional: number of weeks to backfill (max 52, default 1)
 *   "dryRun": false  // Optional: if true, returns data without inserting
 * }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Region configuration (sync with src/config/regions.ts)
const REGIONS = [
  { abbreviation: 'PNBA', file_code: 'pn' },
  { abbreviation: 'CALIBAN', file_code: 'nc' },
  { abbreviation: 'CALIBAS', file_code: 'sc' },
  { abbreviation: 'GLIBA', file_code: 'gl' },
  { abbreviation: 'MPIBA', file_code: 'mp' },
  { abbreviation: 'NAIBA', file_code: 'na' },
  { abbreviation: 'NEIBA', file_code: 'ne' },
  { abbreviation: 'SIBA', file_code: 'si' },
];

interface RegionalBook {
  region: string;
  isbn: string;
  title: string;
  author: string;
  publisher: string | null;
  rank: number;
  category: string | null;
  week_date: string;
  list_title: string | null;
  price: string | null;
}

/**
 * Get the most recent Wednesday date
 */
function getMostRecentWednesday(date?: Date): Date {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay();
  const diff = day >= 3 ? day - 3 : day + 4;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format date as YYMMDD for BookWeb URLs
 */
function formatAsYYMMDD(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Format date as YYYY-MM-DD for database
 */
function formatAsISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Normalize ISBN (remove hyphens, spaces, etc.)
 */
function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[-\s]/g, '');
}

/**
 * Get list title for a region
 */
function getListTitle(regionAbbr: string): string {
  const region = REGIONS.find(r => r.abbreviation === regionAbbr);
  return region ? `${regionAbbr} Independent Bestsellers` : 'Regional Bestsellers';
}

/**
 * Parse regional bestseller list from BookWeb text format
 */
function parseRegionalList(content: string, region: string, weekDate: string): RegionalBook[] {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  const books: RegionalBook[] = [];

  let currentCategory = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header lines
    if (
      line.includes('INDEPENDENT BESTSELLERS') ||
      line.includes('Sales Week Ended') ||
      line.includes('Compiled by') ||
      line === '' ||
      line.startsWith('For more information')
    ) {
      continue;
    }

    // Check if this is a category header (all caps, no numbers)
    if (line.match(/^[A-Z\s]+$/) && line.length > 3 && !line.match(/^\d+/)) {
      currentCategory = line;
      continue;
    }

    // Check if this is a book entry (starts with rank number)
    const rankMatch = line.match(/^(\d+)\.\s*(.+)/);
    if (rankMatch) {
      const rank = parseInt(rankMatch[1]);
      const title = rankMatch[2].trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

      // Parse the details line (author, publisher, price, ISBN)
      if (nextLine && !nextLine.match(/^\d+\./)) {
        const details = nextLine.trim();
        const parts = details.split(',').map(part => part.trim());

        if (parts.length >= 2) {
          const author = parts[0];
          let publisher = parts.length >= 3 ? parts[1] : null;
          let isbn = '';
          let price = null;

          // Look for ISBN in the parts (normalize by removing hyphens)
          for (const part of parts) {
            const cleanPart = normalizeIsbn(part);
            if (cleanPart.match(/^\d{10}(\d{3})?$/)) {
              isbn = cleanPart;
              break;
            }
          }

          // Look for price (e.g., "$16.99", "$28.00")
          const priceMatch = details.match(/\$\d+\.\d{2}/);
          if (priceMatch) {
            price = priceMatch[0];
          }

          // Only add books with valid ISBNs
          if (isbn) {
            books.push({
              region,
              isbn,
              title,
              author,
              publisher,
              rank,
              category: currentCategory || null,
              week_date: weekDate,
              list_title: getListTitle(region),
              price,
            });
          }
        }
        i++; // Skip the details line since we processed it
      }
    }
  }

  return books;
}

/**
 * Fetch and parse a single regional list
 */
async function fetchRegionalList(
  region: { abbreviation: string; file_code: string },
  weekDate: Date
): Promise<RegionalBook[]> {
  const dateStr = formatAsYYMMDD(weekDate);
  const isoDate = formatAsISO(weekDate);
  const url = `https://www.bookweb.org/sites/default/files/regional_bestseller/${dateStr}${region.file_code}.txt`;

  console.log(`Fetching ${region.abbreviation} from ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      console.warn(`Failed to fetch ${region.abbreviation}: ${response.status}`);
      return [];
    }

    const content = await response.text();
    const books = parseRegionalList(content, region.abbreviation, isoDate);

    console.log(`Parsed ${books.length} books from ${region.abbreviation}`);
    return books;
  } catch (error) {
    console.error(`Error fetching ${region.abbreviation}:`, error);
    return [];
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { weekDate: weekDateParam, regions: regionsParam, weeks: weeksParam = 1, dryRun = false } = body;

    // Validate and cap weeks parameter
    const weeks = Math.min(Math.max(1, weeksParam), 52);
    if (weeksParam > 52) {
      console.warn(`Weeks parameter capped at 52 (requested: ${weeksParam})`);
    }

    // Determine starting week date
    const startWeekDate = weekDateParam
      ? getMostRecentWednesday(new Date(weekDateParam))
      : getMostRecentWednesday();

    console.log(`Processing ${weeks} weeks of regional bestsellers starting from ${formatAsISO(startWeekDate)}`);

    // Determine which regions to fetch
    const regionsToFetch = regionsParam && Array.isArray(regionsParam)
      ? REGIONS.filter(r => regionsParam.includes(r.abbreviation))
      : REGIONS;

    console.log(`Fetching data for ${regionsToFetch.length} regions`);

    // Estimate execution time and warn if too long
    const estimatedSeconds = weeks * regionsToFetch.length * 2; // ~2 seconds per region per week
    if (estimatedSeconds > 300) { // 5 minutes
      console.warn(`Estimated execution time: ${Math.round(estimatedSeconds / 60)} minutes. Consider reducing weeks or regions.`);
    }

    // Rate limiting: 500ms delay between requests to avoid overwhelming bookweb.org
    const RATE_LIMIT_DELAY = 500;
    const allBooks: RegionalBook[] = [];
    const progressLog: Array<{ week: string; region: string; booksCount: number; status: string }> = [];

    // Process weeks sequentially to control execution time
    for (let weekOffset = 0; weekOffset < weeks; weekOffset++) {
      const currentWeekDate = new Date(startWeekDate);
      currentWeekDate.setDate(startWeekDate.getDate() - (weekOffset * 7));
      const weekDateISO = formatAsISO(currentWeekDate);

      console.log(`\n=== Processing week ${weekOffset + 1}/${weeks}: ${weekDateISO} ===`);

      // Fetch regions sequentially with rate limiting
      for (const region of regionsToFetch) {
        try {
          const books = await fetchRegionalList(region, currentWeekDate);
          allBooks.push(...books);
          progressLog.push({
            week: weekDateISO,
            region: region.abbreviation,
            booksCount: books.length,
            status: books.length > 0 ? 'success' : 'empty',
          });

          // Rate limiting delay
          if (weekOffset < weeks - 1 || region !== regionsToFetch[regionsToFetch.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
          }
        } catch (error) {
          console.error(`Error fetching ${region.abbreviation} for ${weekDateISO}:`, error);
          progressLog.push({
            week: weekDateISO,
            region: region.abbreviation,
            booksCount: 0,
            status: 'error',
          });
        }
      }
    }

    console.log(`\nTotal books parsed across all weeks: ${allBooks.length}`);

    // If dry run, return data without inserting
    if (dryRun) {
      return new Response(
        JSON.stringify({
          success: true,
          dryRun: true,
          weeksProcessed: weeks,
          startWeekDate: formatAsISO(startWeekDate),
          regionsProcessed: regionsToFetch.map(r => r.abbreviation),
          totalBooks: allBooks.length,
          progressLog,
          sample: allBooks.slice(0, 5),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Insert into database using UPSERT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Batch insert in chunks of 1000 to avoid payload limits
    const BATCH_SIZE = 1000;
    let insertedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < allBooks.length; i += BATCH_SIZE) {
      const batch = allBooks.slice(i, i + BATCH_SIZE);

      const { error } = await supabase
        .from('regional_bestsellers')
        .upsert(batch, {
          onConflict: 'region,isbn,week_date',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error);
        errorCount += batch.length;
      } else {
        insertedCount += batch.length;
        console.log(`Inserted batch ${i / BATCH_SIZE + 1}: ${batch.length} books`);
      }
    }

    // Clean up old data (keep last 52 weeks for historical analysis)
    const fiftyTwoWeeksAgo = new Date(startWeekDate);
    fiftyTwoWeeksAgo.setDate(fiftyTwoWeeksAgo.getDate() - (52 * 7));
    const cutoffDateISO = formatAsISO(fiftyTwoWeeksAgo);

    const { error: deleteError } = await supabase
      .from('regional_bestsellers')
      .delete()
      .lt('week_date', cutoffDateISO);

    if (deleteError) {
      console.warn('Error cleaning up old data:', deleteError);
    } else {
      console.log(`Cleaned up data older than ${cutoffDateISO}`);
    }

    // Calculate weekly scores for the data we just inserted
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    console.log('\n=== Calculating weekly scores ===');

    // Get unique week/region combinations that were successfully processed
    const successfulCombos = progressLog.filter(p => p.status === 'success' && p.booksCount > 0);

    for (const combo of successfulCombos) {
      try {
        console.log(`Triggering score calculation for ${combo.region} on ${combo.week}`);

        const scoreResponse = await fetch(
          `${supabaseUrl}/functions/v1/calculate-weekly-scores`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              weekDate: combo.week,
              region: combo.region,
            }),
          }
        );

        const scoreResult = await scoreResponse.json();

        if (scoreResponse.ok) {
          console.log(`✓ Scores calculated for ${combo.region} ${combo.week}:`, scoreResult.scoresCalculated || 0, 'scores');
        } else {
          console.error(`✗ Failed to calculate scores for ${combo.region} ${combo.week}:`, scoreResult.error);
        }
      } catch (error) {
        console.error(`Error calculating scores for ${combo.region} ${combo.week}:`, error);
        // Don't fail the whole operation if scoring fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        weeksProcessed: weeks,
        startWeekDate: formatAsISO(startWeekDate),
        regionsProcessed: regionsToFetch.map(r => r.abbreviation),
        totalBooks: allBooks.length,
        insertedCount,
        errorCount,
        progressLog,
        message: `Successfully populated ${weeks} weeks of regional bestsellers`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in populate-regional-bestsellers:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
