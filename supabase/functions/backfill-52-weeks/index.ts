import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BestsellerBook {
  rank: number;
  title: string;
  author: string;
  publisher: string;
  price: string;
  isbn: string;
}

interface BestsellerCategory {
  name: string;
  books: BestsellerBook[];
}

function getMostRecentWednesday(today = new Date()): Date {
  const dayOfWeek = today.getDay(); // 0 = Sunday, 3 = Wednesday
  const daysToSubtract = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4;
  const wednesday = new Date(today);
  wednesday.setDate(today.getDate() - daysToSubtract);
  wednesday.setHours(0, 0, 0, 0);
  return wednesday;
}

function toYYMMDD(date: Date): string {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function toYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseList(content: string): { categories: BestsellerCategory[] } {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const categories: BestsellerCategory[] = [];
  let currentCategory: BestsellerCategory | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (isCategoryHeader(line)) {
      if (currentCategory) categories.push(currentCategory);
      currentCategory = { name: formatCategoryName(line), books: [] };
      continue;
    }

    const rankMatch = line.match(/^(\d+)\.\s*(.+)/);
    if (rankMatch && currentCategory) {
      const rank = parseInt(rankMatch[1]);
      const title = rankMatch[2].trim();
      
      let author = '';
      let publisher = '';
      let price = '';
      let isbn = '';

      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const nextLine = lines[j];
        if (nextLine.match(/^\d+\./) || isCategoryHeader(nextLine)) break;
        if (nextLine.includes(',')) {
          const parts = nextLine.split(',').map(p => p.trim());
          if (parts.length >= 2) {
            author = parts[0];
            for (const part of parts) {
              const clean = part.replace(/[-\s]/g, '');
              if (clean.match(/^\d{10}(\d{3})?$/)) {
                isbn = clean;
                break;
              }
            }
            if (parts.length >= 3) {
              publisher = parts[1];
            }
            const priceMatch = parts.find(p => p.match(/\$[\d.]+/));
            if (priceMatch) price = priceMatch;
          }
          i = j; // advance pointer
          break;
        }
      }

      if (isbn) {
        currentCategory.books.push({ rank, title, author, publisher, price, isbn });
      }
    }
  }

  if (currentCategory) categories.push(currentCategory);
  return { categories };
}

function isCategoryHeader(line: string): boolean {
  const categoryPatterns = [
    /^HARDCOVER FICTION/i,
    /^HARDCOVER NONFICTION/i,
    /^TRADE PAPERBACK FICTION/i,
    /^TRADE PAPERBACK NONFICTION/i,
    /^MASS MARKET PAPERBACK/i,
    /^CHILDREN'S ILLUSTRATED/i,
    /^EARLY & MIDDLE GRADE READERS/i,
    /^YOUNG ADULT/i,
    /^CHILDREN'S SERIES TITLES/i
  ];
  return categoryPatterns.some(p => p.test(line));
}

function formatCategoryName(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = new Date().toISOString();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const currentWed = getMostRecentWednesday();
    const weeksToFetch = 52;

    const perWeekResults: Array<{ week_date: string; url: string; rawStored: boolean; positionsUpserted: number; error?: string }>
      = [];

    for (let i = 0; i < weeksToFetch; i++) {
      const date = new Date(currentWed);
      date.setDate(currentWed.getDate() - i * 7);
      const yymmdd = toYYMMDD(date);
      const weekDate = toYYYYMMDD(date);
      const url = `https://www.bookweb.org/sites/default/files/regional_bestseller/${yymmdd}pn.txt`;

      try {
        console.log(`[${i + 1}/${weeksToFetch}] Fetching`, url);
        const resp = await fetch(url);
        if (!resp.ok) {
          const msg = `HTTP ${resp.status} ${resp.statusText}`;
          console.warn('Fetch failed:', url, msg);
          perWeekResults.push({ week_date: weekDate, url, rawStored: false, positionsUpserted: 0, error: msg });
          continue;
        }
        const content = await resp.text();

        // Store raw content in fetch_cache
        const cacheKey = `pnba_raw_${yymmdd}`;
        const { error: cacheErr } = await supabase
          .from('fetch_cache')
          .upsert({
            cache_key: cacheKey,
            data: { url, content, length: content.length },
            last_fetched: new Date().toISOString(),
          }, { onConflict: 'cache_key' });
        if (cacheErr) {
          console.error('Cache upsert error:', cacheErr);
        }

        // Parse and prepare book positions
        const parsed = parseList(content);
        const bookPositions: any[] = [];
        for (const category of parsed.categories) {
          for (const book of category.books) {
            bookPositions.push({
              isbn: book.isbn,
              title: book.title,
              author: book.author,
              publisher: book.publisher,
              category: category.name,
              rank: book.rank,
              price: book.price,
              week_date: weekDate,
              list_title: 'PNBA Independent Bestsellers',
            });
          }
        }

        let upserted = 0;
        if (bookPositions.length > 0) {
          const { error: upsertErr } = await supabase
            .from('book_positions')
            .upsert(bookPositions, { onConflict: 'isbn,week_date,category' });
          if (upsertErr) {
            console.error('Positions upsert error:', upsertErr);
            perWeekResults.push({ week_date: weekDate, url, rawStored: !cacheErr, positionsUpserted: 0, error: upsertErr.message });
            continue;
          }
          upserted = bookPositions.length;
        }

        perWeekResults.push({ week_date: weekDate, url, rawStored: !cacheErr, positionsUpserted: upserted });
      } catch (e: any) {
        console.error('Error processing week', weekDate, e);
        perWeekResults.push({ week_date: weekDate, url, rawStored: false, positionsUpserted: 0, error: e?.message ?? String(e) });
      }
    }

    const successCount = perWeekResults.filter(r => !r.error).length;
    const totalPositions = perWeekResults.reduce((acc, r) => acc + r.positionsUpserted, 0);

    return new Response(
      JSON.stringify({
        success: true,
        startedAt,
        finishedAt: new Date().toISOString(),
        weeksProcessed: perWeekResults.length,
        successWeeks: successCount,
        totalPositions,
        details: perWeekResults,
        note: 'Raw text stored in fetch_cache (cache_key=pnba_raw_YYMMDD). Book positions upserted into book_positions.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('backfill-52-weeks fatal error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message ?? String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
