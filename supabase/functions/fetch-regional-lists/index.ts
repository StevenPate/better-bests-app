import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegionalBook {
  isbn: string;
  title: string;
  author: string;
  publisher?: string;
  rank: number;
  region: string;
}

// Function to get current week's regional list URLs
function getCurrentWeekUrls() {
  // The working URL from user was 250723gl.txt for July 23, 2025
  // So let's use that exact date format
  return {
    'Northern CALIBA': 'https://www.bookweb.org/sites/default/files/regional_bestseller/250723nc.txt',
    'Southern CALIBA': 'https://www.bookweb.org/sites/default/files/regional_bestseller/250723sc.txt',
    'NEIBA': 'https://www.bookweb.org/sites/default/files/regional_bestseller/250723ne.txt',
    'SIBA': 'https://www.bookweb.org/sites/default/files/regional_bestseller/250723si.txt',
    'MPIBA': 'https://www.bookweb.org/sites/default/files/regional_bestseller/250723mp.txt',
    'MIBA': 'https://www.bookweb.org/sites/default/files/regional_bestseller/250723mw.txt',
    'NAIBA': 'https://www.bookweb.org/sites/default/files/regional_bestseller/250723na.txt',
    'GLIBA': 'https://www.bookweb.org/sites/default/files/regional_bestseller/250723gl.txt'
  };
}

// Function to normalize ISBN (remove hyphens, spaces, etc.)
function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[-\s]/g, '');
}

function parseRegionalList(content: string, region: string): RegionalBook[] {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  const books: RegionalBook[] = [];
  
  let currentCategory = '';
  let rank = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip header lines
    if (line.includes('INDEPENDENT BESTSELLERS') || 
        line.includes('Sales Week Ended') ||
        line.includes('Compiled by') ||
        line === '' ||
        line.startsWith('For more information')) {
      continue;
    }
    
    // Check if this is a category header
    if (line.match(/^[A-Z\s]+$/) && line.length > 3 && !line.match(/^\d+/)) {
      currentCategory = line;
      rank = 1;
      continue;
    }
    
    // Check if this is a book entry (starts with rank number)
    const rankMatch = line.match(/^(\d+)\.\s*(.+)/);
    if (rankMatch) {
      const title = rankMatch[2].trim();
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
      
      // Parse the details line (author, publisher, price, ISBN)
      if (nextLine && !nextLine.match(/^\d+\./)) {
        const details = nextLine.trim();
        const parts = details.split(',').map(part => part.trim());
        
        if (parts.length >= 2) {
          const author = parts[0];
          let publisher = '';
          let isbn = '';
          
          // Look for ISBN in the parts (normalize by removing hyphens)
          for (const part of parts) {
            const cleanPart = normalizeIsbn(part);
            if (cleanPart.match(/^\d{10}(\d{3})?$/)) {
              isbn = cleanPart;
              break;
            }
          }
          
          // Publisher is usually the second-to-last part before price/ISBN
          if (parts.length >= 3) {
            publisher = parts[1];
          }
          
          if (isbn) {
            books.push({
              isbn,
              title,
              author,
              publisher,
              rank: parseInt(rankMatch[1]),
              region
            });
          }
        }
        i++; // Skip the details line since we processed it
      }
    }
  }
  
  return books;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Fetching regional bestseller lists...');
    
    const regionalUrls = getCurrentWeekUrls();
    const allRegionalBooks: RegionalBook[] = [];
    
    // Fetch all regional lists
    for (const [region, url] of Object.entries(regionalUrls)) {
      try {
        console.log(`Fetching ${region} from ${url}`);
        const response = await fetch(url);
        if (response.ok) {
          const content = await response.text();
          const books = parseRegionalList(content, region);
          allRegionalBooks.push(...books);
          console.log(`Found ${books.length} books from ${region}`);
        } else {
          console.warn(`Failed to fetch ${region}: ${response.status}`);
        }
      } catch (error) {
        console.error(`Error fetching ${region}:`, error);
      }
    }

    console.log(`Total regional books found: ${allRegionalBooks.length}`);

    // Get current week's PNBA list directly from the web
    const currentPnbaBooks: string[] = [];
    try {
      const pnbaResponse = await fetch('https://www.bookweb.org/sites/default/files/regional_bestseller/250723pn.txt');
      if (pnbaResponse.ok) {
        const pnbaContent = await pnbaResponse.text();
        const pnbaList = parseRegionalList(pnbaContent, 'PNBA');
        pnbaList.forEach(book => currentPnbaBooks.push(normalizeIsbn(book.isbn)));
        console.log(`Found ${pnbaList.length} books on current PNBA list`);
      }
    } catch (error) {
      console.error('Error fetching current PNBA list:', error);
    }

    // Get all PNBA books from the last 52 weeks from database
    const fiftyTwoWeeksAgo = new Date();
    fiftyTwoWeeksAgo.setDate(fiftyTwoWeeksAgo.getDate() - (52 * 7));

    const { data: pnbaBooks, error: pnbaError } = await supabase
      .from('book_positions')
      .select('isbn')
      .like('list_title', '%PNBA%')
      .gte('week_date', fiftyTwoWeeksAgo.toISOString().split('T')[0]);

    if (pnbaError) {
      throw new Error(`Error fetching PNBA books: ${pnbaError.message}`);
    }

    // Combine current PNBA books with historical ones
    const allPnbaIsbns = new Set([
      ...pnbaBooks.map(book => normalizeIsbn(book.isbn)),
      ...currentPnbaBooks
    ]);
    console.log(`Found ${allPnbaIsbns.size} unique PNBA ISBNs (current + last 52 weeks)`);

    // Filter out books that have been on PNBA lists (normalize ISBNs for comparison)
    const elsewhereBooks = allRegionalBooks.filter(book => !allPnbaIsbns.has(normalizeIsbn(book.isbn)));
    
    // Remove duplicates (same ISBN on multiple regional lists) - keep highest rank
    const uniqueBooks = elsewhereBooks.reduce((acc, book) => {
      const existing = acc.find(b => b.isbn === book.isbn);
      if (!existing) {
        acc.push(book);
      } else if (book.rank < existing.rank) {
        acc[acc.indexOf(existing)] = book;
      }
      return acc;
    }, [] as RegionalBook[]);

    console.log(`Final elsewhere books count: ${uniqueBooks.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        books: uniqueBooks.sort((a, b) => a.rank - b.rank),
        totalRegionalBooks: allRegionalBooks.length,
        pnbaIsbnsCount: allPnbaIsbns.size
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in fetch-regional-lists:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
        status: 500
      }
    );
  }
});
