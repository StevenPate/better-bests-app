# populate-regional-bestsellers Edge Function

Fetches bestseller lists from all regional associations and populates the `regional_bestsellers` table for the Elsewhere discovery feature.

## Authentication Model

**IMPORTANT:** This function uses an internal service role key for database writes.

### How Authentication Works

1. **Function Invocation** (caller perspective):
   - Use **ANON key** (public) to invoke the function
   - Or no auth header for scheduled cron jobs
   - **DO NOT** use SERVICE_ROLE_KEY to invoke the function

2. **Database Writes** (function perspective):
   - Function internally creates Supabase client with **SERVICE_ROLE_KEY**
   - This bypasses RLS for the insert operations
   - Service role key is stored as environment variable in Supabase

### Why This Pattern?

- **Security**: Service role key never exposed to clients
- **Flexibility**: Anyone can trigger data refresh (with anon key)
- **Simplicity**: No need for special credentials to run manually

## Usage

### Manual Invocation

```bash
# Using anon key (correct way)
curl -X POST https://<project-ref>.supabase.co/functions/v1/populate-regional-bestsellers \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{}'

# With specific week date
curl -X POST https://<project-ref>.supabase.co/functions/v1/populate-regional-bestsellers \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"weekDate": "2025-11-06"}'

# Dry run (test without writing)
curl -X POST https://<project-ref>.supabase.co/functions/v1/populate-regional-bestsellers \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Specific regions only
curl -X POST https://<project-ref>.supabase.co/functions/v1/populate-regional-bestsellers \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"regions": ["PNBA", "SIBA", "GLIBA"]}'
```

### Finding Your Anon Key

```bash
# In Supabase Dashboard
Settings → API → Project API keys → anon / public

# Or from environment variables
echo $VITE_SUPABASE_ANON_KEY
```

### Scheduled Execution (Recommended)

Set up a Supabase cron job to run weekly:

```sql
-- In Supabase SQL Editor
-- IMPORTANT: Replace <ANON_KEY> with your actual anon key
select cron.schedule(
  'populate-regional-bestsellers',
  '0 10 * * 3',  -- Every Wednesday at 10:00 AM UTC
  $$
  select
    net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/populate-regional-bestsellers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <ANON_KEY>'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

**IMPORTANT:**
- Replace `<ANON_KEY>` with your actual Supabase anon/public key
- Edge functions require authentication even from cron jobs
- Without Authorization header, cron job will fail with 401 Unauthorized

**To get your anon key:**
```bash
# Supabase Dashboard
Settings → API → Project API keys → anon/public

# Or from psql
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE name = 'anon_key';
```

**Testing the cron job:**
```sql
-- Test cron job works before scheduling
SELECT net.http_post(
  url := 'https://<project-ref>.supabase.co/functions/v1/populate-regional-bestsellers',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer <ANON_KEY>'
  ),
  body := '{"dryRun": true}'::jsonb
);

-- Check the response
-- Should see: {"success": true, "dryRun": true, ...}
```

## Request Payload

All fields are optional:

```typescript
{
  weekDate?: string;      // ISO date (YYYY-MM-DD), defaults to most recent Wednesday
  regions?: string[];     // Region abbreviations, defaults to all active regions
  dryRun?: boolean;       // If true, returns data without inserting (default: false)
}
```

## Response Format

### Success

```json
{
  "success": true,
  "weekDate": "2025-11-06",
  "regionsProcessed": ["PNBA", "CALIBAN", "CALIBAS", "GLIBA", "MPIBA", "NAIBA", "NEIBA", "SIBA"],
  "totalBooks": 1247,
  "insertedCount": 1247,
  "errorCount": 0,
  "message": "Successfully populated regional bestsellers for 2025-11-06"
}
```

### Dry Run

```json
{
  "success": true,
  "dryRun": true,
  "weekDate": "2025-11-06",
  "regionsProcessed": ["PNBA", "SIBA"],
  "booksCount": 412,
  "sample": [
    {
      "region": "PNBA",
      "isbn": "9781234567890",
      "title": "Example Book",
      "author": "Example Author",
      "publisher": "Example Publisher",
      "rank": 1,
      "category": "Fiction",
      "week_date": "2025-11-06"
    }
  ]
}
```

### Error

```json
{
  "success": false,
  "error": "Error message here"
}
```

## What It Does

1. **Fetches** bestseller lists from BookWeb for all regions
   - URL pattern: `https://www.bookweb.org/sites/default/files/regional_bestseller/{YYMMDD}{region_code}.txt`
   - Example: `250723pn.txt` for PNBA on July 23, 2025

2. **Parses** text files into structured data
   - Extracts: ISBN, title, author, publisher, rank, category
   - Handles multi-line entries and special characters

3. **Inserts** into `regional_bestsellers` table using UPSERT
   - Constraint: unique(region, isbn, week_date)
   - Updates existing entries if they already exist
   - Batches in chunks of 1000 to avoid payload limits

4. **Cleans up** old data automatically
   - Keeps last 8 weeks of data
   - Deletes entries older than 8 weeks

## Performance

- **Duration**: 5-15 seconds (depends on number of regions)
- **Data size**: ~1,200-2,000 books per week across 9 regions
- **Batch size**: 1,000 rows per insert
- **Network**: Parallel fetching (8 concurrent requests)

## Troubleshooting

### 403 Forbidden Error

**Problem:** Function returns 403 when trying to insert data.

**Cause:** Service role key not set in environment variables.

**Solution:**
```bash
# Check environment variables in Supabase Dashboard
Settings → Edge Functions → Environment Variables

# Ensure SUPABASE_SERVICE_ROLE_KEY is set
# This should be automatically available, but verify it exists
```

### 401 Unauthorized Error

**Problem:** Function invocation fails with 401.

**Cause:** Missing or incorrect Authorization header.

**Solutions:**

1. **Manual invocation:**
   ```bash
   # Use anon key (NOT service role key) for invocation
   curl -H "Authorization: Bearer <ANON_KEY>" ...
   ```

2. **Cron job failing with 401:**
   ```sql
   -- WRONG: Missing Authorization header
   headers := '{"Content-Type": "application/json"}'::jsonb

   -- CORRECT: Include Authorization header with anon key
   headers := jsonb_build_object(
     'Content-Type', 'application/json',
     'Authorization', 'Bearer <ANON_KEY>'
   )
   ```

3. **Test before scheduling:**
   ```sql
   -- Run this once to verify auth works
   SELECT net.http_post(
     url := 'https://<project-ref>.supabase.co/functions/v1/populate-regional-bestsellers',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'Authorization', 'Bearer <ANON_KEY>'
     ),
     body := '{"dryRun": true}'::jsonb
   );
   -- Check for {"success": true} in response
   ```

### Empty Results

**Problem:** Function returns success but 0 books inserted.

**Cause:** BookWeb URLs may have changed or lists not published yet.

**Solution:**
```bash
# Test with dry run to see what's being fetched
curl -X POST <url> -H "Authorization: Bearer <key>" -d '{"dryRun": true}'

# Check function logs in Supabase Dashboard
Logs → Edge Functions → populate-regional-bestsellers
```

### Duplicate Data

**Problem:** Running function multiple times creates duplicates.

**Cause:** Should not happen due to UPSERT constraint.

**Solution:**
```sql
-- Verify unique constraint exists
SELECT conname, conrelid::regclass, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'regional_bestsellers'::regclass
  AND conname = 'regional_bestsellers_region_isbn_week_unique';

-- If missing, re-run migration
-- supabase/migrations/20251105000000_create_regional_bestsellers.sql
```

## Monitoring

### Verify Cron Job is Running

```sql
-- Check if cron job exists
SELECT * FROM cron.job WHERE jobname = 'populate-regional-bestsellers';

-- View cron job run history
SELECT
  jobid,
  runid,
  job_pid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid FROM cron.job WHERE jobname = 'populate-regional-bestsellers'
)
ORDER BY start_time DESC
LIMIT 10;

-- Check for failures
SELECT
  start_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'populate-regional-bestsellers')
  AND status = 'failed'
ORDER BY start_time DESC;
```

**Common failure messages:**
- `401 Unauthorized` → Missing or incorrect Authorization header in cron job
- `timeout` → Edge function took too long (increase timeout or optimize)
- `connection refused` → Edge function not deployed or wrong URL

### Check Last Run

```sql
-- See most recent data in table
SELECT
  region,
  MAX(week_date) as latest_week,
  COUNT(*) as book_count
FROM regional_bestsellers
GROUP BY region
ORDER BY latest_week DESC;
```

### View Function Logs

```bash
# In Supabase Dashboard
Logs → Edge Functions → populate-regional-bestsellers

# Or via CLI
supabase functions logs populate-regional-bestsellers --project-ref <ref>
```

### Monitor Performance

```sql
-- Data growth over time
SELECT
  week_date,
  COUNT(*) as total_books,
  COUNT(DISTINCT region) as active_regions
FROM regional_bestsellers
GROUP BY week_date
ORDER BY week_date DESC
LIMIT 10;
```

## Development

### Local Testing

```bash
# Start local Supabase
supabase start

# Deploy function locally
supabase functions serve populate-regional-bestsellers --env-file .env.local

# Test locally
curl -X POST http://localhost:54321/functions/v1/populate-regional-bestsellers \
  -H "Authorization: Bearer <LOCAL_ANON_KEY>" \
  -d '{"dryRun": true}'
```

### Deploying

```bash
# Deploy to remote Supabase
supabase functions deploy populate-regional-bestsellers --project-ref <project-ref>

# Verify deployment
supabase functions list --project-ref <project-ref>
```

## Related Documentation

- [Elsewhere Implementation Plan](../../../docs/planning/ElsewhereList_IMPLEMENTATION_PLAN.md)
- [Architectural Decision](../../../docs/elsewhere/ARCHITECTURAL_DECISION.md)
- [Edge Function Migration Plan](../../../docs/elsewhere/EDGE_FUNCTION_MIGRATION_PLAN.md)
