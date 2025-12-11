/**
 * Backfill 2025 Scores Edge Function
 *
 * One-time backfill to calculate scores for all 2025 regional_bestsellers data.
 * This should be run once after the weekly_scores table is created.
 *
 * Usage:
 * curl -X POST https://<project>.supabase.co/functions/v1/backfill-2025-scores \
 *   -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
 *   -H "Content-Type: application/json"
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function calculateScore(rank: number, listSize: number): number {
  if (rank < 1 || listSize < 1) return 0;
  return 100 * (1 - Math.log(rank) / Math.log(listSize + 1));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting 2025 scores backfill...');

    // Get all unique week_date + region combinations from 2025
    // Fetch with pagination to avoid 1000 row limit
    let allRows: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('regional_bestsellers')
        .select('week_date, region')
        .gte('week_date', '2025-01-01')
        .lt('week_date', '2026-01-01')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;

      if (data && data.length > 0) {
        allRows.push(...data);
        console.log(`Fetched page ${page + 1}: ${data.length} rows (${allRows.length} total)`);
        page++;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`Fetched ${allRows.length} total rows`);

    // Deduplicate to get unique week_date + region combinations
    const uniqueCombos = Array.from(
      new Set(allRows.map((r: any) => `${r.week_date}|${r.region}`))
    ).map(combo => {
      const [week_date, region] = combo.split('|');
      return { week_date, region };
    });

    console.log(`Found ${uniqueCombos.length} unique week/region combinations`);

    let totalScores = 0;
    const errors = [];

    // Process each combination
    for (const combo of uniqueCombos) {
      try {
        // Fetch all books for this week/region
        const { data: books, error } = await supabase
          .from('regional_bestsellers')
          .select('isbn, region, week_date, rank, category')
          .eq('week_date', combo.week_date)
          .eq('region', combo.region);

        if (error) throw error;
        if (!books || books.length === 0) continue;

        // Calculate list sizes per category
        const categoryListSizes: Record<string, number> = {};
        books.forEach((book: any) => {
          const cat = book.category || 'General';
          categoryListSizes[cat] = (categoryListSizes[cat] || 0) + 1;
        });

        // Calculate scores
        const scores = books.map((book: any) => {
          const cat = book.category || 'General';
          const listSize = categoryListSizes[cat];
          return {
            isbn: book.isbn,
            region: book.region,
            week_date: book.week_date,
            rank: book.rank,
            category: cat,  // Store the normalized category ('General' instead of NULL)
            list_size: listSize,
            points: calculateScore(book.rank, listSize),
          };
        });

        // Batch upsert
        const { error: upsertError } = await supabase
          .from('weekly_scores')
          .upsert(scores, {
            onConflict: 'isbn,region,week_date,category',
            ignoreDuplicates: false,
          });

        if (upsertError) throw upsertError;

        totalScores += scores.length;
        console.log(`Processed ${combo.region} ${combo.week_date}: ${scores.length} scores`);

      } catch (error) {
        console.error(`Error processing ${combo.region} ${combo.week_date}:`, error);
        errors.push({ combo, error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalScoresCalculated: totalScores,
        weekRegionCombinations: uniqueCombos.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ error: 'Backfill failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
