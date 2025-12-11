import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BestsellerEntry {
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  description?: string;
  blurb: string;
  small_image_uri?: string;
  large_image_uri?: string;
  rank: string;
  last?: string;
  weeks_on_list?: string;
}

interface BestsellerSection {
  title: string;
  entries: BestsellerEntry[];
}

interface BestsellerResponse {
  title: string;
  description: string;
  for_date: string;
  end_date: string;
  sections: BestsellerSection[];
}

function getCurrentWednesday(): Date {
  const today = new Date();
  const daysSinceWednesday = (today.getDay() + 4) % 7;
  const wednesday = new Date(today);
  wednesday.setDate(today.getDate() - daysSinceWednesday);
  return wednesday;
}

function getPreviousWednesday(): Date {
  const currentWednesday = getCurrentWednesday();
  const previousWednesday = new Date(currentWednesday);
  previousWednesday.setDate(currentWednesday.getDate() - 7);
  return previousWednesday;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  }).replace(',', 'th,');
}

async function fetchBookCover(isbn: string): Promise<{ small?: string; large?: string }> {
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const book = data.items[0].volumeInfo;
      if (book.imageLinks) {
        return {
          small: book.imageLinks.thumbnail || book.imageLinks.smallThumbnail,
          large: book.imageLinks.large || book.imageLinks.medium || book.imageLinks.thumbnail
        };
      }
    }
    
    return {};
  } catch (error) {
    console.error('Error fetching book cover for', isbn, ':', error);
    return {};
  }
}

async function getWeeksOnList(supabase: any, isbn: string, currentDate: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('book_positions')
      .select('week_date')
      .like('list_title', '%PNBA%')
      .eq('isbn', isbn)
      .lte('week_date', currentDate)
      .order('week_date', { ascending: false });

    if (error || !data) return 1;

    // Count consecutive weeks from current date backwards
    let weeks = 0;
    const currentDateObj = new Date(currentDate);
    
    for (const entry of data) {
      const entryDate = new Date(entry.week_date);
      const expectedDate = new Date(currentDateObj);
      expectedDate.setDate(expectedDate.getDate() - (weeks * 7));
      
      // Allow for some date flexibility (within 3 days)
      const daysDiff = Math.abs(entryDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysDiff <= 3) {
        weeks++;
      } else {
        break;
      }
    }
    
    return Math.max(weeks, 1);
  } catch (error) {
    console.error('Error calculating weeks on list:', error);
    return 1;
  }
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

    const currentWednesday = getCurrentWednesday();
    const previousWednesday = getPreviousWednesday();
    const currentDate = formatDate(currentWednesday);
    const previousDate = formatDate(previousWednesday);

    console.log(`Fetching PNBA bestsellers for ${currentDate}`);

    // Get current week's PNBA bestsellers
    const { data: currentBooks, error: currentError } = await supabase
      .from('book_positions')
      .select('*')
      .like('list_title', '%PNBA%')
      .eq('week_date', currentDate)
      .order('rank', { ascending: true });

    if (currentError) {
      throw new Error(`Error fetching current bestsellers: ${currentError.message}`);
    }

    // Get previous week's positions for comparison
    const { data: previousBooks, error: previousError } = await supabase
      .from('book_positions')
      .select('isbn, rank')
      .like('list_title', '%PNBA%')
      .eq('week_date', previousDate);

    if (previousError) {
      console.warn(`Warning fetching previous week data: ${previousError.message}`);
    }

    // Create a map of previous week's positions
    const previousPositions = new Map();
    if (previousBooks) {
      previousBooks.forEach(book => {
        previousPositions.set(book.isbn, book.rank);
      });
    }

    // Group books by category
    const sections = new Map<string, BestsellerEntry[]>();

    for (const book of currentBooks || []) {
      const category = book.category || 'General';
      
      if (!sections.has(category)) {
        sections.set(category, []);
      }

      // Get book cover images
      const images = await fetchBookCover(book.isbn);
      
      // Calculate weeks on list
      const weeksOnList = await getWeeksOnList(supabase, book.isbn, currentDate);
      
      // Get previous rank
      const previousRank = previousPositions.get(book.isbn);
      
      // Create blurb with position info
      let blurb = book.publisher ? `Published by ${book.publisher}.` : '';
      if (previousRank) {
        blurb += `\nRank last week: ${previousRank}`;
      }
      blurb += `\nWeeks on list: ${weeksOnList}`;

      const entry: BestsellerEntry = {
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        publisher: book.publisher || '',
        blurb: blurb.trim(),
        rank: book.rank.toString(),
        last: previousRank?.toString(),
        weeks_on_list: weeksOnList.toString()
      };

      if (images.small) entry.small_image_uri = images.small;
      if (images.large) entry.large_image_uri = images.large;

      sections.get(category)!.push(entry);
    }

    // Convert sections map to array format
    const sectionsArray: BestsellerSection[] = Array.from(sections.entries()).map(([title, entries]) => ({
      title: `${title} Bestsellers`,
      entries
    }));

    // Sort sections by importance (Fiction first, then Non-fiction, then others)
    sectionsArray.sort((a, b) => {
      const getOrder = (title: string) => {
        if (title.toLowerCase().includes('fiction') && !title.toLowerCase().includes('non')) return 1;
        if (title.toLowerCase().includes('non')) return 2;
        return 3;
      };
      return getOrder(a.title) - getOrder(b.title);
    });

    const response: BestsellerResponse = {
      title: `PNBA Bestsellers for ${formatDisplayDate(currentWednesday)}`,
      description: `For the week ending ${formatDisplayDate(previousWednesday)}, based on sales in independent bookstores in the Pacific Northwest.`,
      for_date: currentDate,
      end_date: previousDate,
      sections: sectionsArray
    };

    return new Response(
      JSON.stringify(response, null, 2),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Error in pnba-bestsellers-json:', error);
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch bestsellers',
        message: error.message
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