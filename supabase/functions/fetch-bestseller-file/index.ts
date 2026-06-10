/**
 * CORS proxy for fetching bestseller files from bookweb.org and Google Drive.
 *
 * This bypasses browser CORS restrictions by fetching from the server side.
 *
 * Security:
 * - Strict hostname validation (bookweb.org + drive.usercontent.google.com)
 * - Rate limiting via Supabase platform (automatic)
 * - Only allows HTTPS requests to allowed paths
 * - Input validation on all parameters
 */

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Validate URL is an allowed fetch target:
 * - bookweb.org /regional_bestseller/ paths (legacy)
 * - drive.usercontent.google.com /download paths (new Google Drive hosting)
 */
function isValidFetchUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS
    if (url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // bookweb.org: only /regional_bestseller/ path
    if (hostname === 'bookweb.org' || hostname === 'www.bookweb.org') {
      return url.pathname.includes('/regional_bestseller/');
    }

    // Google Drive download: only /download path
    if (hostname === 'drive.usercontent.google.com') {
      return url.pathname === '/download';
    }

    return false;
  } catch {
    return false;
  }
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Note: Authentication/rate limiting is handled by Supabase platform
    // This function is protected by:
    // 1. Strict URL validation (only bookweb.org/regional_bestseller/)
    // 2. Supabase's built-in rate limiting
    // 3. HTTPS-only enforcement
    // 4. Path validation

    // Get URL parameter
    const url = new URL(req.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      console.warn('Missing url parameter');
      return new Response(
        JSON.stringify({ error: 'Missing url parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Strict URL validation
    if (!isValidFetchUrl(targetUrl)) {
      console.warn('Invalid URL blocked:', targetUrl);
      return new Response(
        JSON.stringify({
          error: 'Invalid URL - only HTTPS requests to bookweb.org/regional_bestseller/ or drive.usercontent.google.com/download are allowed'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Fetching:', targetUrl);

    // Fetch with retry logic
    let lastError: Error | null = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Better-Bestsellers/1.0',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();

        // Validate content
        if (!text || text.trim().length < 100) {
          throw new Error('Empty or invalid response');
        }

        // Check if it's an HTML error page instead of list data
        const lowerText = text.toLowerCase();
        if (lowerText.includes('<!doctype html') ||
            lowerText.includes('<html') ||
            lowerText.includes('404 not found') ||
            lowerText.includes('page not found')) {
          console.warn('⚠️ Received HTML error page instead of list data - file may not be available yet');
          // Don't return HTML as valid content - let other proxies try
          // But log what we got for debugging
          console.log('First 200 chars of HTML:', text.substring(0, 200));
          throw new Error('Received HTML error page instead of list data - file may not be available yet');
        }

        // Verify it looks like actual bestseller list data
        // Check for keywords common across all regional bestseller files
        const upper = text.toUpperCase();
        if (!upper.includes('BESTSELLER') &&
            !upper.includes('INDEPENDENT BESTSELLERS') &&
            !upper.includes('INDIEBOUND')) {
          console.warn('Content does not appear to be bestseller list data');
          console.log('First 200 chars:', text.substring(0, 200));
          throw new Error('Content does not appear to be bestseller list data');
        }

        console.log(`✅ Success: fetched ${text.length} bytes of valid list data on attempt ${attempt}`);

        return new Response(
          JSON.stringify({
            contents: text,
            status: { http_code: 200 }
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`⚠️  Attempt ${attempt}/${maxAttempts} failed:`, lastError.message);

        if (attempt < maxAttempts) {
          const delay = 1000 * attempt;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All attempts failed - log as error for monitoring
    console.error(`❌ All ${maxAttempts} attempts failed for ${targetUrl}:`, lastError?.message);
    console.error('Stack:', lastError?.stack);

    throw lastError;

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('❌ Edge function error:', err.message);
    console.error('Stack:', err.stack);

    return new Response(
      JSON.stringify({
        error: err.message,
        contents: '',
        status: { http_code: 500 }
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
