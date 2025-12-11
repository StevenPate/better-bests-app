#!/usr/bin/env node

/**
 * MIBA Historical Data Backfill Script
 *
 * Fetches past 52 weeks of MIBA bestseller data from BookWeb.org
 * and populates the regional_bestsellers table via the populate-regional-bestsellers edge function.
 *
 * Usage:
 *   node scripts/backfill-miba-historical.js [options]
 *
 * Options:
 *   --weeks=N        Number of weeks to backfill (default: 52, max: 52)
 *   --dry-run        Show what would be done without making changes
 *   --start-date     Custom start date (YYYY-MM-DD format, defaults to 52 weeks ago)
 *
 * Examples:
 *   node scripts/backfill-miba-historical.js
 *   node scripts/backfill-miba-historical.js --weeks=12
 *   node scripts/backfill-miba-historical.js --dry-run
 *   node scripts/backfill-miba-historical.js --start-date=2024-01-01 --weeks=10
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  weeks: 52,
  dryRun: false,
  startDate: null,
};

args.forEach(arg => {
  if (arg.startsWith('--weeks=')) {
    options.weeks = Math.min(Math.max(1, parseInt(arg.split('=')[1])), 52);
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg.startsWith('--start-date=')) {
    options.startDate = arg.split('=')[1];
  }
});

// Validation
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Error: Missing required environment variables');
  console.error('   Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Check your .env file or environment configuration');
  process.exit(1);
}

/**
 * Get the most recent Wednesday from a given date
 */
function getMostRecentWednesday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day >= 3 ? day - 3 : day + 4;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Calculate start date (52 weeks back or custom)
 */
function getStartDate() {
  if (options.startDate) {
    return getMostRecentWednesday(new Date(options.startDate));
  }
  const now = new Date();
  const weeksAgo = new Date(now);
  weeksAgo.setDate(weeksAgo.getDate() - (options.weeks * 7));
  return getMostRecentWednesday(weeksAgo);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call the populate-regional-bestsellers edge function for a specific week
 */
async function backfillWeek(weekDate, weekNumber, totalWeeks) {
  const url = `${SUPABASE_URL}/functions/v1/populate-regional-bestsellers`;

  const payload = {
    weekDate: formatDate(weekDate),
    regions: ['MIBA'], // Only backfill MIBA
    weeks: 1,
    dryRun: options.dryRun,
  };

  try {
    console.log(`\n[${weekNumber}/${totalWeeks}] Processing week: ${formatDate(weekDate)}`);

    if (options.dryRun) {
      console.log('   📋 DRY RUN - Would fetch MIBA data for this week');
      return { success: true, dryRun: true };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error(`   ❌ Failed: ${result.error || 'Unknown error'}`);
      return { success: false, error: result.error };
    }

    console.log(`   ✅ Success: ${result.totalBooks || 0} books processed`);
    return result;

  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Main backfill function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  MIBA Historical Data Backfill Script');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Weeks to backfill: ${options.weeks}`);
  console.log(`  Region: MIBA only`);
  console.log(`  Rate limit: 500ms between requests`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const startDate = getStartDate();
  const endDate = getMostRecentWednesday(new Date());

  console.log(`Start date: ${formatDate(startDate)}`);
  console.log(`End date:   ${formatDate(endDate)}`);
  console.log(`Estimated time: ~${Math.ceil(options.weeks * 0.5 / 60)} minutes\n`);

  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE - No data will be written to the database\n');
  }

  // Confirm before proceeding (skip in dry-run mode)
  if (!options.dryRun) {
    console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...');
    await sleep(3000);
  }

  const results = {
    total: 0,
    successful: 0,
    failed: 0,
    errors: [],
  };

  // Process each week sequentially with rate limiting
  const currentDate = new Date(endDate);
  for (let i = 0; i < options.weeks; i++) {
    results.total++;

    const result = await backfillWeek(currentDate, i + 1, options.weeks);

    if (result.success) {
      results.successful++;
    } else {
      results.failed++;
      results.errors.push({
        week: formatDate(currentDate),
        error: result.error,
      });
    }

    // Move to previous week
    currentDate.setDate(currentDate.getDate() - 7);

    // Rate limiting: 500ms between requests (except for last iteration)
    if (i < options.weeks - 1) {
      await sleep(500);
    }
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Backfill Complete');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Total weeks processed: ${results.total}`);
  console.log(`  ✅ Successful: ${results.successful}`);
  console.log(`  ❌ Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\n  Errors:');
    results.errors.forEach(err => {
      console.log(`    ${err.week}: ${err.error}`);
    });
  }

  if (options.dryRun) {
    console.log('\n  ⚠️  This was a DRY RUN - no data was written');
    console.log('  Run without --dry-run to actually backfill data');
  }

  console.log('═══════════════════════════════════════════════════════════\n');

  // Exit with error code if any failures
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the script
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
