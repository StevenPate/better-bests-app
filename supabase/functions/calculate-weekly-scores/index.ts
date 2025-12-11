/**
 * Calculate Weekly Scores Edge Function
 *
 * Calculates performance scores for books when new regional bestseller data arrives.
 * Called by populate-regional-bestsellers after inserting new data.
 *
 * This function:
 * 1. Fetches all books for the given week/region from regional_bestsellers
 * 2. Determines list_size per category
 * 3. Calculates points using logarithmic formula
 * 4. Upserts to weekly_scores table
 *
 * Usage:
 * - Internal: Called by populate-regional-bestsellers edge function
 * - Manual: POST to /functions/v1/calculate-weekly-scores
 *   curl -X POST https://<project>.supabase.co/functions/v1/calculate-weekly-scores \
 *     -H "Authorization: Bearer <ANON_KEY>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"weekDate": "2025-11-06", "region": "PNBA"}'
 *
 * Payload:
 * {
 *   "weekDate": "2025-11-06",  // Required: ISO date string (Wednesday)
 *   "region": "PNBA"  // Required: region code
 * }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WeeklyScoreRequest {
  weekDate: string;
  region: string;
}

interface RegionalBook {
  isbn: string;
  region: string;
  week_date: string;
  rank: number;
  category: string | null;
}

/**
 * Calculate weekly score using logarithmic decay formula
 */
function calculateScore(rank: number, listSize: number): number {
  if (rank < 1 || listSize < 1) return 0;
  return 100 * (1 - Math.log(rank) / Math.log(listSize + 1));
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { weekDate, region }: WeeklyScoreRequest = await req.json();

    if (!weekDate || !region) {
      return new Response(
        JSON.stringify({ error: 'weekDate and region are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role for database writes
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Calculating weekly scores for ${region} on ${weekDate}`);

    // Fetch all books for this week/region
    const { data: books, error: fetchError } = await supabase
      .from('regional_bestsellers')
      .select('isbn, region, week_date, rank, category')
      .eq('week_date', weekDate)
      .eq('region', region);

    if (fetchError) {
      console.error('Error fetching books:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch books', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!books || books.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No books found for this week/region', weekDate, region }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine list_size per category
    const categoryListSizes: Record<string, number> = {};
    books.forEach((book: RegionalBook) => {
      const cat = book.category || 'General';
      categoryListSizes[cat] = (categoryListSizes[cat] || 0) + 1;
    });

    // Calculate scores
    const scores = books.map((book: RegionalBook) => {
      const cat = book.category || 'General';
      const listSize = categoryListSizes[cat];
      const points = calculateScore(book.rank, listSize);

      return {
        isbn: book.isbn,
        region: book.region,
        week_date: book.week_date,
        rank: book.rank,
        category: cat,  // Store the normalized category ('General' instead of NULL)
        list_size: listSize,
        points: points,
      };
    });

    // Upsert to weekly_scores
    const { error: upsertError } = await supabase
      .from('weekly_scores')
      .upsert(scores, {
        onConflict: 'isbn,region,week_date,category',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error('Error upserting scores:', upsertError);
      return new Response(
        JSON.stringify({ error: 'Failed to upsert scores', details: upsertError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully calculated ${scores.length} weekly scores`);

    return new Response(
      JSON.stringify({
        success: true,
        weekDate,
        region,
        scoresCalculated: scores.length,
        categories: Object.keys(categoryListSizes),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
