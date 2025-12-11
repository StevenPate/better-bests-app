/**
 * Supabase Edge Function: batch-switch-operations
 *
 * PURPOSE:
 * Handles bulk updates for POS/Shelf switching in bestseller lists
 * Reduces N individual requests to a single batched operation
 *
 * SECURITY:
 * - Requires authenticated PBN staff user
 * - RLS policies enforce list_date scoping
 * - Rate limited to 1000 updates per request
 *
 * Created: 2025-10-21 (Issue #13 - Task 4)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============================================================================
// Type Definitions
// ============================================================================

interface SwitchUpdate {
  book_isbn: string;
  switch_type: 'pos' | 'shelf';
  checked: boolean;
}

interface BatchSwitchRequest {
  region: string; // Region abbreviation (e.g., 'PNBA', 'SIBA')
  list_date: string; // ISO date string (YYYY-MM-DD)
  updates: SwitchUpdate[];
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ⚠️ SECURITY: Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Missing authorization header',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT (RLS will enforce permissions)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is authenticated and get their ID
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('Authentication failed:', authError?.message);
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Invalid or expired authentication token',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { region, list_date, updates }: BatchSwitchRequest = await req.json();

    // ✅ VALIDATION: Check required fields
    if (!region || !list_date || !Array.isArray(updates)) {
      return new Response(
        JSON.stringify({
          error: 'Invalid request',
          message: 'Required fields: region (string), list_date (string), updates (array)',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (updates.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No updates to process',
          updated: 0,
          deleted: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ RATE LIMITING: Max 1000 updates per request
    if (updates.length > 1000) {
      return new Response(
        JSON.stringify({
          error: 'Payload too large',
          message: 'Maximum 1000 updates per request',
        }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ VALIDATION: Validate each update
    for (const update of updates) {
      if (!update.book_isbn || typeof update.book_isbn !== 'string') {
        return new Response(
          JSON.stringify({
            error: 'Invalid update',
            message: 'Each update must have a book_isbn (string)',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!['pos', 'shelf'].includes(update.switch_type)) {
        return new Response(
          JSON.stringify({
            error: 'Invalid update',
            message: 'switch_type must be either "pos" or "shelf"',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (typeof update.checked !== 'boolean') {
        return new Response(
          JSON.stringify({
            error: 'Invalid update',
            message: 'checked must be a boolean',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Separate updates into inserts (checked=true) and deletes (checked=false)
    const toInsert = updates.filter(u => u.checked);
    const toDelete = updates.filter(u => !u.checked);

    let insertedCount = 0;
    let deletedCount = 0;

    // ============================================================================
    // BATCH UPSERT (for checked switches)
    // ============================================================================
    if (toInsert.length > 0) {
      const insertRecords = toInsert.map(update => ({
        region,
        book_isbn: update.book_isbn,
        switch_type: update.switch_type,
        list_date,
        created_by: user.id,
      }));

      const { error: insertError } = await supabase
        .from('bestseller_switches')
        .upsert(insertRecords, {
          onConflict: 'region,book_isbn,switch_type',
        });

      if (insertError) {
        console.error('Batch insert error:', insertError);
        return new Response(
          JSON.stringify({
            error: 'Database operation failed',
            message: insertError.message,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      insertedCount = toInsert.length;
    }

    // ============================================================================
    // BATCH DELETE (for unchecked switches)
    // ============================================================================
    if (toDelete.length > 0) {
      // Build delete query for each combination of (book_isbn, switch_type, list_date)
      // Since we can't use a compound "in" clause, we need to delete in batches
      for (const update of toDelete) {
        const { error: deleteError } = await supabase
          .from('bestseller_switches')
          .delete()
          .eq('region', region)
          .eq('book_isbn', update.book_isbn)
          .eq('switch_type', update.switch_type)
          .eq('list_date', list_date);

        if (deleteError) {
          console.error('Batch delete error:', deleteError);
          // Continue with other deletes even if one fails
          // Log the error but don't fail the whole operation
        } else {
          deletedCount++;
        }
      }
    }

    console.log(`Batch switch update: ${insertedCount} inserted, ${deletedCount} deleted for user ${user.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: insertedCount,
        deleted: deletedCount,
        list_date,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: errorMessage,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
