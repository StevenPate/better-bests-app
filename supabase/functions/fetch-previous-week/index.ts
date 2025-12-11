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

function parseList(content: string): { categories: BestsellerCategory[] } {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const categories: BestsellerCategory[] = [];
  let currentCategory: BestsellerCategory | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if this line is a category header
    if (isCategoryHeader(line)) {
      if (currentCategory) {
        categories.push(currentCategory);
      }
      currentCategory = {
        name: formatCategoryName(line),
        books: []
      };
      continue;
    }
    
    // Check if this is a book entry (starts with rank number)
    const rankMatch = line.match(/^(\d+)\.\s*(.+)/);
    if (rankMatch && currentCategory) {
      const rank = parseInt(rankMatch[1]);
      const title = rankMatch[2].trim();
      
      // Look for the next lines that contain book details
      let author = '';
      let publisher = '';
      let price = '';
      let isbn = '';
      
      // Check next few lines for book details
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const nextLine = lines[j];
        
        // Skip if it's another book entry or category
        if (nextLine.match(/^\d+\./) || isCategoryHeader(nextLine)) {
          break;
        }
        
        // Parse book details line
        if (nextLine.includes(',')) {
          const parts = nextLine.split(',').map(part => part.trim());
          
          if (parts.length >= 2) {
            author = parts[0];
            
            // Look for ISBN in any part
            for (const part of parts) {
              const cleanPart = part.replace(/[-\s]/g, '');
              if (cleanPart.match(/^\d{10}(\d{3})?$/)) {
                isbn = cleanPart;
                break;
              }
            }
            
            // Publisher is usually before price/ISBN
            if (parts.length >= 3) {
              publisher = parts[1];
            }
            
            // Price is usually last or second to last
            const priceMatch = parts.find(part => part.match(/\$[\d.]+/));
            if (priceMatch) {
              price = priceMatch;
            }
          }
          
          i = j; // Skip the processed line
          break;
        }
      }
      
      if (isbn) {
        currentCategory.books.push({
          rank,
          title,
          author,
          publisher,
          price,
          isbn
        });
      }
    }
  }
  
  // Add the last category if it exists
  if (currentCategory) {
    categories.push(currentCategory);
  }
  
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
  
  return categoryPatterns.some(pattern => pattern.test(line));
}

function formatCategoryName(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
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

    console.log('Fetching previous week PNBA data from: https://www.bookweb.org/sites/default/files/regional_bestseller/250820pn.txt');
    
    // Fetch the previous week's PNBA data
    const response = await fetch('https://www.bookweb.org/sites/default/files/regional_bestseller/250820pn.txt');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }
    
    const content = await response.text();
    console.log('Successfully fetched PNBA data, parsing...');
    
    // Parse the bestseller list
    const parsedData = parseList(content);
    
    // Calculate the week date (August 20, 2025 = 250820 format)
    const weekDate = '2025-08-20'; // The week ending date from the filename
    
    // Prepare batch insert data
    const bookPositions = [];
    
    for (const category of parsedData.categories) {
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
          list_title: 'PNBA Independent Bestsellers'
        });
      }
    }
    
    console.log(`Parsed ${bookPositions.length} books from ${parsedData.categories.length} categories`);
    
    // Batch insert into database
    if (bookPositions.length > 0) {
      const { error } = await supabase
        .from('book_positions')
        .upsert(bookPositions, {
          onConflict: 'isbn,week_date,category'
        });
      
      if (error) {
        console.error('Database insert error:', error);
        throw new Error(`Database insert failed: ${error.message}`);
      }
    }
    
    console.log(`Successfully stored ${bookPositions.length} book positions for week ${weekDate}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully fetched and stored ${bookPositions.length} book positions for week ${weekDate}`,
        categories: parsedData.categories.length,
        weekDate: weekDate
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Error in fetch-previous-week:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 500,
      }
    );
  }
});