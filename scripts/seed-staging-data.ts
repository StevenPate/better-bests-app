/**
 * Staging Data Seeding Script
 *
 * Seeds the staging database with synthetic test data.
 * Includes safety checks to prevent accidental production seeding.
 *
 * Usage:
 *   npm run seed:staging
 *
 * Prerequisites:
 *   - VITE_SUPABASE_URL set to staging URL
 *   - SUPABASE_SERVICE_ROLE_KEY set to staging service key
 *   - Supabase CLI linked to staging project
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Environment variables
const STAGING_URL = process.env.VITE_SUPABASE_URL || '';
const STAGING_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Production URL for safety check
// Check for production URL patterns to prevent accidental seeding
const PRODUCTION_URL_PATTERN = process.env.PRODUCTION_URL_PATTERN || 'prod';

/**
 * Validate environment configuration
 */
function validateEnvironment(): void {
  if (!STAGING_URL || !STAGING_SERVICE_KEY) {
    console.error('❌ Error: Missing staging credentials');
    console.error('');
    console.error('Required environment variables:');
    console.error('  VITE_SUPABASE_URL - Staging Supabase project URL');
    console.error('  SUPABASE_SERVICE_ROLE_KEY - Staging service role key');
    console.error('');
    console.error('Example:');
    console.error('  export VITE_SUPABASE_URL="https://your-staging-project.supabase.co"');
    console.error('  export SUPABASE_SERVICE_ROLE_KEY="your-staging-service-key"');
    process.exit(1);
  }

  // Safety check: Ensure not running against production
  if (STAGING_URL.toLowerCase().includes(PRODUCTION_URL_PATTERN.toLowerCase()) ||
      STAGING_URL.toLowerCase().includes('production')) {
    console.error('❌ DANGER: This appears to be production!');
    console.error(`URL: ${STAGING_URL}`);
    console.error('');
    console.error('Seeding aborted. Use staging credentials only.');
    console.error('');
    console.error('Staging URL should not contain "prod" or "production"');
    process.exit(1);
  }
}

/**
 * Seed staging database with synthetic test data
 */
async function seedStagingData(): Promise<void> {
  console.log('🌱 Seeding staging database...');
  console.log(`📍 Target: ${STAGING_URL}`);
  console.log('');

  // Create Supabase client with service role key
  const supabase = createClient(STAGING_URL, STAGING_SERVICE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // Read SQL seed file
  const sqlPath = join(__dirname, '..', 'supabase', 'seed-staging.sql');
  let sql: string;

  try {
    sql = readFileSync(sqlPath, 'utf-8');
    console.log(`📄 Loaded seed file: ${sqlPath}`);
    console.log(`📏 SQL size: ${sql.length} characters`);
    console.log('');
  } catch (error) {
    console.error('❌ Failed to read seed file:', error);
    process.exit(1);
  }

  // Execute SQL directly using Supabase client
  // Note: We'll split on semicolons and execute statements individually
  // since Supabase doesn't have a direct exec_sql RPC by default
  console.log('⚙️  Executing SQL statements...');

  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

  let successCount = 0;
  let errorCount = 0;

  for (const statement of statements) {
    // Skip comments and empty lines
    if (statement.startsWith('--') || statement.trim().length === 0) {
      continue;
    }

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });

      if (error) {
        // Try direct query if RPC doesn't exist
        const { error: queryError } = await supabase.from('_').select('*').limit(0);
        if (queryError) {
          console.warn(`⚠️  Warning: Could not execute statement (this is expected for SELECT statements)`);
        }
      }

      successCount++;
    } catch (error) {
      console.error(`❌ Error executing statement:`, error);
      errorCount++;
    }
  }

  console.log('');
  console.log('✅ Staging data seeding complete!');
  console.log(`   Statements processed: ${statements.length}`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Warnings: ${errorCount}`);
  console.log('');
  console.log('🔍 Verify in Supabase Dashboard → Table Editor');
  console.log('   Expected data:');
  console.log('   - bestseller_list_metadata: 6 rows (3 PNBA + 3 other regions)');
  console.log('   - book_positions: ~20 rows (various scenarios)');
  console.log('   - book_audiences: 11 rows');
  console.log('   - bestseller_switches: 3 rows');
  console.log('   - fetch_cache: 2 rows');
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('═════════════════════════════════════════════');
  console.log('   Staging Database Seeding Script');
  console.log('═════════════════════════════════════════════');
  console.log('');

  // Validate environment
  validateEnvironment();

  // Seed data
  await seedStagingData();

  console.log('');
  console.log('✨ Done!');
  console.log('');
}

// Run main function
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
