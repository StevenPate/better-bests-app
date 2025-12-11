/**
 * Preflight safety check to prevent destructive operations against production
 *
 * Run before: migrations, db reset, data seeding, schema changes
 * Detects: Production URL in .env, confirms user intent
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as readline from 'readline';

// Production URL pattern - set via environment variable if needed
const PRODUCTION_URL_PATTERN = process.env.PRODUCTION_URL_PATTERN || 'prod';

interface PreflightOptions {
  operation: string;
  requiresConfirmation?: boolean;
  allowProduction?: boolean;
}

async function preflightCheck(options: PreflightOptions): Promise<void> {
  const { operation, requiresConfirmation = true, allowProduction = false } = options;

  console.log(`\n🔍 Preflight check for: ${operation}`);

  // Check 1: Read .env file
  const envPath = join(process.cwd(), '.env');
  let envContent: string;

  try {
    envContent = readFileSync(envPath, 'utf-8');
  } catch (error) {
    console.error('❌ ERROR: No .env file found');
    console.error('   Copy .env.example to .env first');
    process.exit(1);
  }

  // Check 2: Detect production URL (check for 'production' or 'prod' in the URL)
  const supabaseUrl = envContent.match(/VITE_SUPABASE_URL=["']?([^"'\n]+)/)?.[1] || '';
  const isProduction = supabaseUrl.toLowerCase().includes(PRODUCTION_URL_PATTERN.toLowerCase()) ||
                       envContent.toLowerCase().includes('production');

  if (isProduction && !allowProduction) {
    console.error('\n❌ DANGER: Production database detected!');
    console.error(`   Operation: ${operation}`);
    console.error(`   Database: ${supabaseUrl}`);
    console.error('\n   This operation is NOT allowed against production from local machines.');
    console.error('\n   To proceed:');
    console.error('   1. Switch to staging: cp .env.staging .env');
    console.error('   2. Verify: cat .env | grep VITE_SUPABASE_URL');
    console.error('   3. Re-run this command\n');
    process.exit(1);
  }

  if (isProduction && allowProduction) {
    console.warn('\n⚠️  WARNING: Production database detected');
    console.warn(`   Operation: ${operation}`);
    console.warn(`   Database: ${supabaseUrl}`);

    if (requiresConfirmation) {
      const confirmed = await confirmAction(
        '\n   Are you ABSOLUTELY SURE you want to proceed? (type "yes" to confirm)'
      );

      if (!confirmed) {
        console.log('   ✅ Operation cancelled (safe choice)');
        process.exit(0);
      }
    }
  }

  // Check 3: Display current environment
  const urlMatch = envContent.match(/VITE_SUPABASE_URL="([^"]+)"/);
  const currentUrl = urlMatch ? urlMatch[1] : 'unknown';

  console.log('\n   Current environment:');
  console.log(`   Database: ${currentUrl}`);
  console.log(`   Is Production: ${isProduction ? 'YES ⚠️' : 'No ✅'}`);

  if (!isProduction) {
    console.log(`\n✅ Preflight check passed for ${operation}\n`);
  }
}

async function confirmAction(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(prompt + ' ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

// CLI interface
const operation = process.argv[2] || 'unknown operation';
const allowProduction = process.argv.includes('--allow-production');

preflightCheck({
  operation,
  requiresConfirmation: true,
  allowProduction,
}).catch((error) => {
  console.error('Preflight check failed:', error);
  process.exit(1);
});
