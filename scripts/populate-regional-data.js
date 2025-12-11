#!/usr/bin/env node

/**
 * Script to populate missing regional bestseller data
 * Run this to backfill the last 4 weeks of regional data
 *
 * Usage: node scripts/populate-regional-data.js
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function populateRegionalData(weeks = 4) {
  console.log(`📚 Populating ${weeks} week(s) of regional bestseller data...`);

  try {
    // Call the edge function
    const { data, error } = await supabase.functions.invoke('populate-regional-bestsellers', {
      body: {
        weeks: weeks,
        dryRun: false
      },
    });

    if (error) {
      throw error;
    }

    console.log('✅ Successfully populated regional data!');

    // Check how many records were inserted
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (weeks * 7));

    const { count } = await supabase
      .from('regional_bestsellers')
      .select('*', { count: 'exact', head: true })
      .gte('week_date', startDate.toISOString().split('T')[0]);

    console.log(`📊 Total records in date range: ${count}`);

    return data;
  } catch (error) {
    console.error('❌ Error populating regional data:', error);
    throw error;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const weeks = args[0] ? parseInt(args[0]) : 4;

  if (isNaN(weeks) || weeks < 1 || weeks > 52) {
    console.error('❌ Invalid number of weeks. Please provide a number between 1 and 52.');
    process.exit(1);
  }

  console.log('🚀 Regional Bestseller Data Population');
  console.log('=====================================');

  try {
    await populateRegionalData(weeks);

    console.log('\n✨ Done! Regional data has been populated.');
    console.log('Next steps:');
    console.log('1. Check the Better Bestsellers site to verify regional data is showing');
    console.log('2. The cron job will now keep data updated weekly');

  } catch (error) {
    console.error('\n❌ Failed to populate data. Please check the error above.');
    process.exit(1);
  }
}

// Run the script
main();