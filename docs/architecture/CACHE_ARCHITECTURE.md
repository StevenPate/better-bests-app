# Cache Architecture Overview

_Last updated: 2025-11-08_

BetterBests uses multiple cache layers to keep the app responsive while protecting bookweb.org from excess traffic. This document maps every cache, the code paths that populate them, and how to flush or inspect them safely.

---

## 1. Server-Side Caches (Supabase)

### 1.1 `fetch_cache` table
- **Owner:** `BestsellerParser.getCachedData` / `setCachedData`
- **Key format:**
  - Current week: `{REGION}_current_bestseller_list_v2`
  - Comparison week: `{REGION}_bestseller_list_vs_{YYYY-MM-DD}_v2`
- **Contents:** JSON blob with `{ current: BestsellerList, previous: BestsellerList }`
- **Invalidation:**
  - Pass `refresh: true` to `BestsellerParser.fetchBestsellerData`
  - Manually `DELETE FROM fetch_cache WHERE cache_key LIKE 'PNBA_%'`
- **Safety guard:** `shouldFetchNewData` compares `last_fetched` to decide whether to refresh automatically (see §2).

### 1.2 `bestseller_list_metadata`
- **Owner:** secure backend scraper (`fetch-pnba-lists` edge function)
- **Purpose:** Stores freshness data (week date, checksum, fetch duration)
- **Usage:** Diagnostics page and cron job monitoring
- **Invalidation:** Overwritten whenever backend scraper runs

### 1.3 `job_run_history`
- **Owner:** secure backend scraper
- **Purpose:** Run logs for pg_cron executions
- **Usage:** Validate cron health; no direct impact on frontend caching

### 1.4 Supabase Edge Function (`fetch-bestseller-file`)
- **Caching:** None (stateless proxy). Each call fetches live file from bookweb.org with 3 retries.
- **Validation:** Enforces host/path whitelist; returns JSON `{ contents, status }`.

---

## 2. Workflow: How Data Moves Into the Cache

```
User action / cron trigger
  ↓
BestsellerParser.fetchBestsellerData({ region, comparisonWeek, refresh })
  ↓
1. Check `fetch_cache` (skip when `refresh === true`)
2. Fetch files via `fetchWithCorsProxy`
3. Verify content with `isValidBestsellerContent`
4. Parse + compare lists
5. Upsert book positions & audiences (edge function)
6. Persist new payload to `fetch_cache`
```

`shouldFetchNewData(region)` performs a lightweight `fetch_cache` lookup using the `_v2` key. If the cache is older than seven days (or missing) it signals the UI to refresh in the background.

---

## 3. Client-Side Caches

### 3.1 React Query
| Hook | Query Key | Cached Data | Invalidation |
|------|-----------|-------------|--------------|
| `useBestsellerData` | `['bestseller-data', region, comparisonWeek]` | Parsed bestseller lists | `queryClient.invalidateQueries({ queryKey: ['bestseller-data', region] })` (see `refresh()` helper) |
| `useBookAudiences` | `['book-audiences', list.date, isbnSignature]` | ISBN → audience map | Automatic when list contents change; stale time 30 min |
| `useElsewhereData` | `['elsewhere', filters...]` | Elsewhere discovery payload | Manual refetch via hook consumer |
| `useBestsellerSwitches` (not shown) | Local switching state keyed by region | Local only |

React Query runs entirely in-browser; no persisted storage between sessions.

### 3.2 LocalStorage Keys
| Key | Producer | Purpose |
|-----|----------|---------|
| `preferred-region` | `RegionProvider` | Remembers last region for routing |
| `historical-fetched-{REGION}` | `useBestsellerData` | Throttle background historical refresh to once per 24h |
| `bestseller-pos-data` | Components | Persist POS checkbox state |
| `bestseller-shelf-data` | Components | Persist shelf checkbox state |
| `supabase.auth.token` | Supabase client | Session persistence (handled by SDK) |

To clear all client caches, run `localStorage.clear()` in devtools and refresh.

---

## 4. Manual Cache Maintenance

### 4.1 Force Refresh from Diagnostics UI
- **Current Week:** `Refresh Region` → calls `fetchBestsellerData({ refresh: true })` → overwrites `fetch_cache`
- **Comparison Week:** `Refresh Comparison` → same flow but with `comparisonWeek`
- **Previous Week:** `Refresh Previous Week` (deprecated once upstream API reliable)

### 4.2 SQL Helpers
```sql
-- Inspect cached payload
SELECT cache_key, last_fetched
FROM fetch_cache
WHERE cache_key LIKE 'PNBA_%'
ORDER BY last_fetched DESC;

-- Purge PNBA cache
DELETE FROM fetch_cache
WHERE cache_key LIKE 'PNBA_%';

-- Inspect backend scraper metadata
SELECT week_date, fetched_at, checksum
FROM bestseller_list_metadata
ORDER BY fetched_at DESC
LIMIT 5;
```

### 4.3 React Query Programmatic Reset
Call `queryClient.clear()` from browser console (after grabbing the instance via debug tools) to wipe in-memory caches.

---

## 5. Known Failure Modes & Signals
- **Validation fallback triggered:** Logger emits `Current week content validation failed` with proxy + length. Indicates upstream file missing or heuristics misfired.
- **`shouldFetchNewData` false positives:** Occurs when `_v2` key mismatch existed (fixed in commit `a30302a`). Ensure cache keys end with `_v2`.
- **Supabase 500 on upserts:** Caused by conflicting `onConflict` + `ignoreDuplicates` (fixed in commits `f51eee3` / `fc0c6ad`).
- **Browser stuck on stale bundle:** Hard refresh (`Cmd+Shift+R`) or clear service-worker cache if using Vercel/Netlify.

---

## 6. Recommended Operating Procedure
1. **Weekly validation:** After pg_cron runs, check `bestseller_list_metadata` for the new week and confirm Diagnostics displays matching dates.
2. **Manual override:** If Wednesday data is delayed upstream, run Diagnostics refresh with `refresh: true`. If validation fails again, investigate upstream file availability before retrying.
3. **Cache purge drill:** Practice purging `fetch_cache` in staging so the flow is familiar when production incidents occur.
4. **Monitoring:** Tail Supabase function logs for repeated validation warnings; frequent fallbacks suggest upstream content issues or a regression in heuristics.

---

For deeper debugging, trace through `BestsellerParser.fetchBestsellerData` alongside network logs. With this map you can determine exactly which cache supplied a response and what to clear when data looks wrong.

---

## 7. Cache Access & Security

### 7.1 Row Level Security (RLS) Configuration

The `fetch_cache` table has RLS enabled with specific policies to control access:

**Read Access:** Anonymous and authenticated users can read all cache entries
```sql
-- Migration: 20251106044654_fix_fetch_cache_rls.sql
CREATE POLICY "Enable read access for all users"
ON fetch_cache FOR SELECT
TO anon, authenticated
USING (true);
```

**Write Access:** Only service role can write to cache (via edge functions)

**Historical Issue:** Before November 2024, RLS was enabled without read policies, causing "No data available" errors. Migration `20251106044654_fix_fetch_cache_rls.sql` fixed this permanently.

### 7.2 Cache Key Consistency

**Shared Constants** (`src/constants/cacheKeys.ts`):
```typescript
export function getCacheKey(comparisonWeek?: string | null): string {
  return comparisonWeek
    ? `bestseller_list_vs_${comparisonWeek}`
    : 'current_bestseller_list';
}
```

**Edge Function Strategy:** Stores data with BOTH base and comparison keys to prevent key mismatch issues:
```typescript
// Store with base key
await supabase.from('fetch_cache').upsert({
  cache_key: 'current_bestseller_list',
  data: cacheData
});

// Also store with comparison key
await supabase.from('fetch_cache').upsert({
  cache_key: `bestseller_list_vs_${previousWeek}`,
  data: cacheData
});
```

**Frontend Usage:** Always use the shared helper:
```typescript
import { getCacheKey } from '@/constants/cacheKeys';
const cacheKey = getCacheKey(comparisonWeek);
```

### 7.3 Health Check Monitoring

**Automated Health Check Script:**
```bash
node check-cache-health.js
```

Validates:
- ✓ RLS policies are working
- ✓ Expected cache keys exist
- ✓ Data structure is valid
- ✓ Cache isn't stale (> 7 days)

**Run After:**
- Any deployment
- Database migrations
- Edge function updates
- When investigating cache-related issues

### 7.4 Testing Checklist

**1. Test RLS Access (Browser Console):**
```javascript
await (await import('https://esm.sh/@supabase/supabase-js@2'))
  .createClient(SUPABASE_URL, ANON_KEY)
  .from('fetch_cache')
  .select('cache_key')
  .single()
```

**2. Verify Cache Keys:**
```bash
node list-cache-keys.js
```

**3. SQL Verification:**
```sql
-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'fetch_cache';

-- List cache keys
SELECT cache_key, last_fetched
FROM fetch_cache
ORDER BY last_fetched DESC;
```

### 7.5 Quick Fixes for Common Issues

**If "No data available" appears:**

1. **Check RLS Policies:**
```sql
SELECT * FROM pg_policies WHERE tablename = 'fetch_cache';
```
If missing, apply migration: `supabase db push`

2. **Verify Cache Keys Exist:**
```sql
SELECT cache_key, last_fetched
FROM fetch_cache
ORDER BY last_fetched DESC;
```

3. **Copy to Expected Key (temporary workaround):**
```sql
INSERT INTO fetch_cache (cache_key, data, last_fetched, created_at)
SELECT
  'bestseller_list_vs_2025-10-26', -- or whatever key frontend expects
  data, last_fetched, NOW()
FROM fetch_cache
WHERE cache_key = 'current_bestseller_list'
ON CONFLICT (cache_key) DO UPDATE SET
  data = EXCLUDED.data,
  last_fetched = EXCLUDED.last_fetched;
```

4. **Trigger Edge Function Manually:**
```bash
curl -X POST \
  'https://auwllsalgwiwdzohpmum.supabase.co/functions/v1/fetch-pnba-lists' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json'
```

### 7.6 Development Workflow Best Practices

**Before Deploying:**
- Run health check locally
- Verify RLS policies in staging database
- Test cache key generation with sample data

**After Edge Function Changes:**
- Ensure function writes to BOTH cache keys (base + comparison)
- Test with frontend immediately
- Verify cache entries exist in database

**After Frontend Changes:**
- Confirm using correct cache key helper from `cacheKeys.ts`
- Check browser console for cache errors
- Test with both current and comparison week scenarios

### 7.7 Key Files for Cache Management

- `supabase/migrations/20251106044654_fix_fetch_cache_rls.sql` - RLS policy fix
- `src/constants/cacheKeys.ts` - Shared cache key logic
- `check-cache-health.js` - Health monitoring script (root directory)
- `supabase/functions/fetch-pnba-lists/index.ts` - Backend scraper edge function
- `src/utils/bestsellerParser.ts` - Frontend cache consumer

### 7.8 Monitoring & Alerts

**Regular Checks:**
- **Weekly:** Run `check-cache-health.js` after Wednesday cron jobs
- **After Deployments:** Verify cache access in browser console
- **Continuous:** Monitor for errors containing "No cached data found"

**Recommended Alerts:**
- Cache age > 7 days (indicates stale data)
- RLS policy violations in logs
- Cache key mismatch errors
- Edge function failures writing to cache

---

For cache-related incidents, follow this hierarchy: (1) Check RLS policies, (2) Verify cache keys exist, (3) Inspect edge function logs, (4) Review database for constraint violations.
