/**
 * Update Book Metrics Edge Function
 *
 * Recalculates aggregate performance metrics for books using SQL aggregation.
 * Runs nightly via Supabase cron job.
 *
 * This function calls the PostgreSQL function aggregate_book_metrics() which:
 * 1. Aggregates weekly_scores into book_performance_metrics (SQL GROUP BY)
 * 2. Calculates regional breakdowns in book_regional_performance (SQL GROUP BY)
 * 3. Computes RSI variance for "Most National" ranking (SQL VARIANCE)
 *
 * All aggregation happens in PostgreSQL for maximum efficiency.
 * No rows are pulled into Edge Function memory.
 *
 * Usage:
 * - Scheduled: Supabase cron (nightly at 2am PT)
 * - Manual: POST to /functions/v1/update-book-metrics
 *   curl -X POST https://<project>.supabase.co/functions/v1/update-book-metrics \
 *     -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"year": 2025}'
 *
 * Payload:
 * {
 *   "year": 2025  // Optional: defaults to current year
 * }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateMetricsRequest {
  year?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: UpdateMetricsRequest = await req.json().catch(() => ({}));
    const year = body.year || new Date().getFullYear();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Updating book metrics for year ${year} using SQL aggregation...`);

    // Call PostgreSQL function that does all aggregation in SQL
    // This is FAR more efficient than pulling rows into Edge Function memory
    const { data, error } = await supabase.rpc('aggregate_book_metrics', {
      target_year: year
    });

    if (error) {
      console.error('SQL aggregation error:', error);
      throw error;
    }

    console.log('SQL aggregation complete:', data);

    return new Response(
      JSON.stringify({
        success: true,
        year,
        method: 'sql_aggregation',
        booksProcessed: data.books_processed,
        metricsUpdated: data.metrics_updated,
        regionalUpdated: data.regional_updated,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Metrics update error:', error);
    return new Response(
      JSON.stringify({
        error: 'Metrics update failed',
        details: error.message,
        hint: 'Ensure aggregate_book_metrics() function exists (migration 20251109120000)'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
