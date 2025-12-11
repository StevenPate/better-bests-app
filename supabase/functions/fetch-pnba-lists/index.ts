/**
 * Supabase Edge Function: fetch-pnba-lists
 *
 * Purpose: Scheduled backend job to fetch, parse, compare, and persist PNBA bestseller data
 *
 * Triggers:
 * - Weekly via pg_cron (Wednesday 2 AM PT)
 * - Manual trigger via authenticated request (for testing/backfill)
 *
 * Security: Requires service role key (not exposed to client)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.1';

// ============================================================================
// Type Definitions
// ============================================================================

interface BestsellerBook {
  rank: number;
  title: string;
  author: string;
  publisher: string;
  price: string;
  isbn: string;
  isNew?: boolean;
  wasDropped?: boolean;
  previousRank?: number;
  weeksOnList?: number;
}

interface BestsellerCategory {
  name: string;
  books: BestsellerBook[];
}

interface BestsellerList {
  title: string;
  date: string;
  categories: BestsellerCategory[];
}

interface JobRunRecord {
  job_name: string;
  started_at: string;
  completed_at?: string;
  status: 'running' | 'success' | 'failed' | 'timeout' | 'skipped_no_new_data';
  weeks_processed?: number;
  books_inserted?: number;
  books_updated?: number;
  error_message?: string;
  error_details?: Record<string, any>;
  metadata?: Record<string, any>;
}

// ============================================================================
// CORS Headers
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the most recent Wednesday date
 */
function getMostRecentWednesday(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 3 = Wednesday
  const daysToSubtract = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4;
  const wednesday = new Date(now);
  wednesday.setDate(now.getDate() - daysToSubtract);
  wednesday.setHours(0, 0, 0, 0);
  return wednesday;
}

/**
 * Format date as YYMMDD for bookweb.org URLs
 */
function formatAsYYMMDD(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Fetch with exponential backoff retry
 */
async function fetchWithRetry(
  url: string,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Fetching ${url} (attempt ${attempt + 1}/${maxRetries})`);

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Better-Bestsellers-Backend/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();

      // Validate we got actual content
      if (!text || text.trim().length < 100) {
        throw new Error('Empty or invalid response from server');
      }

      console.log(`Successfully fetched ${url} (${text.length} bytes)`);
      return text;
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${attempt + 1} failed: ${error.message}`);

      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Calculate SHA-256 checksum of content
 */
async function calculateChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================================================
// Parsing Functions (from client bestsellerParser.ts)
// ============================================================================

function isCategoryHeader(line: string): boolean {
  return line === line.toUpperCase() &&
         line.length > 3 &&
         !line.match(/^\d/) &&
         !line.includes('$') &&
         !line.includes('978') &&
         line.includes(' ');
}

function isBookEntry(line: string): boolean {
  return /^\d+\.\s/.test(line);
}

function isDetailLine(line: string): boolean {
  const hasIsbn = /978\d{10}|979\d{10}/.test(line);
  const hasPrice = /\$[\d,]+\.?\d*/.test(line);
  const hasMultipleCommas = (line.match(/,/g) || []).length >= 1;

  if (hasIsbn || hasPrice) return true;
  if (hasMultipleCommas && line.length > 10) return true;

  return false;
}

function formatCategoryName(categoryLine: string): string {
  return categoryLine
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function parseBookEntryWithLookahead(
  titleLine: string,
  lines: string[],
  startIndex: number
): { book: BestsellerBook | null; nextIndex: number } {
  const titleMatch = titleLine.match(/^(\d+)\.\s(.+)$/);
  if (!titleMatch) {
    return { book: null, nextIndex: startIndex + 1 };
  }

  const rank = parseInt(titleMatch[1]);
  let title = titleMatch[2];

  let detailLineIndex = startIndex + 1;
  let detailLine = '';

  while (detailLineIndex < lines.length) {
    const candidateLine = lines[detailLineIndex];

    if (isBookEntry(candidateLine) || isCategoryHeader(candidateLine)) {
      break;
    }

    if (isDetailLine(candidateLine)) {
      detailLine = candidateLine;
      break;
    }

    title += ' ' + candidateLine;
    detailLineIndex++;
  }

  if (!detailLine) {
    return { book: null, nextIndex: detailLineIndex };
  }

  const isbnMatch = detailLine.match(/978\d{10}|979\d{10}/);
  const isbn = isbnMatch ? isbnMatch[0] : '';

  const priceMatch = detailLine.match(/\$[\d,]+\.?\d*/);
  const price = priceMatch ? priceMatch[0] : '';

  let authorPublisher = detailLine;
  if (isbn) authorPublisher = authorPublisher.replace(isbn, '');
  if (price) authorPublisher = authorPublisher.replace(price, '');

  authorPublisher = authorPublisher.replace(/,\s*,/g, ',').replace(/,\s*$/, '').trim();
  const parts = authorPublisher.split(',').map(part => part.trim()).filter(part => part.length > 0);

  const author = parts[0] || 'Unknown Author';
  const publisher = parts[1] || 'Unknown Publisher';

  return {
    book: {
      rank,
      title: title.trim(),
      author,
      publisher,
      price,
      isbn
    },
    nextIndex: detailLineIndex + 1
  };
}

function parseList(content: string): BestsellerList {
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  let title = '';
  let date = '';
  const categories: BestsellerCategory[] = [];
  let currentCategory: BestsellerCategory | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (i < 5 && line.toLowerCase().includes('bestsellers')) {
      title = line;
    }

    if (i < 5 && line.includes('week ended')) {
      const dateMatch = line.match(/week ended (\w+, \w+ \d+, \d+)/);
      if (dateMatch) {
        date = dateMatch[1];
      }
    }

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

    if (currentCategory && isBookEntry(line)) {
      const result = parseBookEntryWithLookahead(line, lines, i);
      if (result.book) {
        currentCategory.books.push(result.book);
        i = result.nextIndex - 1;
      }
    }
  }

  if (currentCategory) {
    categories.push(currentCategory);
  }

  return {
    title: title || 'Better Bestsellers',
    date,
    categories
  };
}

// ============================================================================
// Comparison Logic
// ============================================================================

async function compareLists(
  current: BestsellerList,
  previous: BestsellerList,
  supabase: any
): Promise<BestsellerList> {
  console.log('Starting list comparison...');

  // Collect all ISBNs for batch lookup
  const isbnSet = new Set<string>();
  current.categories.forEach(cat => {
    cat.books.forEach(book => {
      if (book.isbn) isbnSet.add(book.isbn);
    });
  });
  previous.categories.forEach(cat => {
    cat.books.forEach(book => {
      if (book.isbn) isbnSet.add(book.isbn);
    });
  });

  // Batch fetch weeks-on-list data
  const weeksOnListData: Record<string, number> = {};
  if (isbnSet.size > 0) {
    const { data, error } = await supabase.rpc('get_weeks_on_list_batch', {
      isbn_list: Array.from(isbnSet),
    });

    if (!error && data) {
      data.forEach((row: any) => {
        weeksOnListData[row.isbn] = row.weeks_on_list || 0;
      });
    }
  }

  const getWeeksCount = (isbn?: string): number => {
    return isbn ? (weeksOnListData[isbn] || 0) : 0;
  };

  const updatedCategories = current.categories.map(currentCategory => {
    const previousCategory = previous.categories.find(cat => cat.name === currentCategory.name);

    const updatedBooks = currentCategory.books.map(currentBook => {
      const previousBook = previousCategory?.books.find(book => {
        if (currentBook.isbn && book.isbn) {
          return book.isbn === currentBook.isbn;
        }
        return book.title === currentBook.title && book.author === currentBook.author;
      });

      const weeksOnList = getWeeksCount(currentBook.isbn);

      if (!previousBook) {
        return { ...currentBook, isNew: true, weeksOnList };
      }

      return {
        ...currentBook,
        previousRank: previousBook.rank,
        isNew: false,
        weeksOnList
      };
    });

    // Add dropped books
    const droppedBooks = (previousCategory?.books.filter(prevBook =>
      !currentCategory.books.find(currBook => {
        if (prevBook.isbn && currBook.isbn) {
          return currBook.isbn === prevBook.isbn;
        }
        return currBook.title === prevBook.title && currBook.author === prevBook.author;
      })
    ) || []).map(book => {
      const weeksOnList = getWeeksCount(book.isbn);
      return { ...book, wasDropped: true, weeksOnList };
    });

    return {
      ...currentCategory,
      books: [...updatedBooks, ...droppedBooks]
    };
  });

  console.log('List comparison complete');
  return {
    ...current,
    categories: updatedCategories
  };
}

// ============================================================================
// Database Operations
// ============================================================================

function getDefaultAudience(categoryName: string): string {
  const adultCategories = [
    'Hardcover Fiction', 'Hardcover Nonfiction',
    'Trade Paperback Fiction', 'Trade Paperback Nonfiction',
    'Mass Market Paperback'
  ];

  const childrenCategories = [
    'Children\'s Illustrated', 'Early & Middle Grade Readers',
    'Children\'s Series Titles'
  ];

  if (adultCategories.includes(categoryName)) {
    return 'A';
  } else if (childrenCategories.includes(categoryName)) {
    return 'C';
  } else if (categoryName === 'Young Adult') {
    return 'T';
  }

  return 'A';
}

async function saveToDatabase(
  list: BestsellerList,
  weekDate: Date,
  supabase: any
): Promise<{ inserted: number; updated: number }> {
  console.log('Saving to database...');
  const weekDateStr = weekDate.toISOString().split('T')[0];

  const bookPositions = [];
  const audienceAssignments = [];

  for (const category of list.categories) {
    for (const book of category.books) {
      if (!book.wasDropped) {
        bookPositions.push({
          isbn: book.isbn,
          title: book.title,
          author: book.author,
          publisher: book.publisher,
          category: category.name,
          rank: book.rank,
          price: book.price,
          week_date: weekDateStr,
          list_title: list.title
        });

        if (book.isbn) {
          audienceAssignments.push({
            isbn: book.isbn,
            audience: getDefaultAudience(category.name)
          });
        }
      }
    }
  }

  console.log(`Prepared ${bookPositions.length} positions, ${audienceAssignments.length} audiences`);

  // Upsert book positions
  if (bookPositions.length > 0) {
    const { error } = await supabase
      .from('book_positions')
      .upsert(bookPositions, {
        onConflict: 'isbn,week_date,category'
      });

    if (error) {
      console.error('Error upserting book positions:', error);
      throw new Error(`Failed to save book positions: ${error.message}`);
    }
  }

  // Upsert audience assignments
  if (audienceAssignments.length > 0) {
    const { error } = await supabase
      .from('book_audiences')
      .upsert(audienceAssignments, {
        ignoreDuplicates: true  // Automatically uses isbn UNIQUE constraint
      });

    if (error) {
      console.error('Error upserting audiences:', error);
      throw new Error(`Failed to save audiences: ${error.message}`);
    }
  }

  console.log('Database save complete');
  return { inserted: bookPositions.length, updated: 0 };
}

// ============================================================================
// Main Job Function
// ============================================================================

async function runScrapingJob(supabase: any): Promise<JobRunRecord> {
  const jobStart = new Date().toISOString();
  let jobRecord: JobRunRecord = {
    job_name: 'fetch-pnba-bestsellers',
    started_at: jobStart,
    status: 'running',
    metadata: {},
  };

  try {
    console.log('=== Job started at', jobStart, '===');

    // Determine weeks to fetch
    const currentWednesday = getMostRecentWednesday();
    const previousWednesday = new Date(currentWednesday);
    previousWednesday.setDate(currentWednesday.getDate() - 7);

    const currentDateStr = formatAsYYMMDD(currentWednesday);
    const previousDateStr = formatAsYYMMDD(previousWednesday);

    const currentUrl = `https://www.bookweb.org/sites/default/files/regional_bestseller/${currentDateStr}pn.txt`;
    const previousUrl = `https://www.bookweb.org/sites/default/files/regional_bestseller/${previousDateStr}pn.txt`;

    console.log('Fetching current week:', currentUrl);
    console.log('Fetching previous week:', previousUrl);

    // Fetch both weeks in parallel
    const [currentContent, previousContent] = await Promise.all([
      fetchWithRetry(currentUrl),
      fetchWithRetry(previousUrl),
    ]);

    // Calculate checksums
    const [currentChecksum, previousChecksum] = await Promise.all([
      calculateChecksum(currentContent),
      calculateChecksum(previousContent),
    ]);

    console.log('Current checksum:', currentChecksum);
    console.log('Previous checksum:', previousChecksum);

    // Check if this is actually NEW data by comparing with existing metadata
    const { data: existingMetadata } = await supabase
      .from('bestseller_list_metadata')
      .select('checksum, week_date')
      .eq('week_date', currentWednesday.toISOString().split('T')[0])
      .single();

    if (existingMetadata && existingMetadata.checksum === currentChecksum) {
      console.log('⏩ Data already processed (same checksum). Skipping...');

      jobRecord = {
        ...jobRecord,
        completed_at: new Date().toISOString(),
        status: 'skipped_no_new_data',
        metadata: {
          currentWeek: currentWednesday.toISOString().split('T')[0],
          currentChecksum,
          existingChecksum: existingMetadata.checksum,
          reason: 'Data already processed with same checksum',
        },
      };

      console.log('=== Job skipped (no new data) ===');
      return jobRecord;
    }

    console.log('✨ New data detected! Processing...');

    // Parse lists
    const currentList = parseList(currentContent);
    const previousList = parseList(previousContent);

    console.log(`Current list: ${currentList.categories.length} categories`);
    console.log(`Previous list: ${previousList.categories.length} categories`);

    // Compare lists
    const comparedList = await compareLists(currentList, previousList, supabase);

    // Save to database
    const saveResult = await saveToDatabase(comparedList, currentWednesday, supabase);

    // Update metadata table
    await supabase
      .from('bestseller_list_metadata')
      .upsert({
        week_date: currentWednesday.toISOString().split('T')[0],
        source_url: currentUrl,
        checksum: currentChecksum,
        book_count: saveResult.inserted,
        category_count: currentList.categories.length,
        comparison_week_date: previousWednesday.toISOString().split('T')[0],
        is_current_week: true,
      });

    // Mark other weeks as not current
    await supabase
      .from('bestseller_list_metadata')
      .update({ is_current_week: false })
      .neq('week_date', currentWednesday.toISOString().split('T')[0]);

    // Update cache with multiple keys for backward compatibility
    const cacheData = {
      current: comparedList,
      previous: previousList
    };
    const lastFetched = new Date().toISOString();

    // Store with base key for no-comparison queries
    await supabase
      .from('fetch_cache')
      .upsert({
        cache_key: 'current_bestseller_list',
        data: cacheData,
        last_fetched: lastFetched,
      }, {
        onConflict: 'cache_key'
      });

    // Also store with comparison key for frontend compatibility
    // This ensures the frontend can find data regardless of how it queries
    const previousWeekStr = previousWednesday.toISOString().split('T')[0];
    await supabase
      .from('fetch_cache')
      .upsert({
        cache_key: `bestseller_list_vs_${previousWeekStr}`,
        data: cacheData,
        last_fetched: lastFetched,
      }, {
        onConflict: 'cache_key'
      });

    console.log(`✅ Cache updated with keys: current_bestseller_list and bestseller_list_vs_${previousWeekStr}`);

    // Success!
    jobRecord = {
      ...jobRecord,
      completed_at: new Date().toISOString(),
      status: 'success',
      weeks_processed: 2,
      books_inserted: saveResult.inserted,
      books_updated: saveResult.updated,
      metadata: {
        currentWeek: currentWednesday.toISOString().split('T')[0],
        previousWeek: previousWednesday.toISOString().split('T')[0],
        currentChecksum,
        previousChecksum,
      },
    };

    console.log('=== Job completed successfully ===');
    return jobRecord;

  } catch (error) {
    console.error('Job failed:', error);

    jobRecord = {
      ...jobRecord,
      completed_at: new Date().toISOString(),
      status: 'failed',
      error_message: error.message,
      error_details: {
        stack: error.stack,
        name: error.name,
      },
    };

    return jobRecord;
  }
}

// ============================================================================
// Edge Function Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Run the scraping job
    const jobRecord = await runScrapingJob(supabase);

    // Log to job_run_history
    await supabase
      .from('job_run_history')
      .insert(jobRecord);

    // Return response
    return new Response(
      JSON.stringify({
        success: jobRecord.status === 'success',
        job: jobRecord,
      }),
      {
        status: jobRecord.status === 'success' ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
