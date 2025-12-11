# MIBA Implementation Plan
## Adding the 9th Regional Association: Midwest Independent Booksellers Association

**Date Created:** December 3, 2025
**Status:** Planning Phase
**Organization:** Midwest Independent Booksellers Association (MIBA)
**File Code:** `mw`
**BookWeb URL Pattern:** `https://www.bookweb.org/sites/default/files/regional_bestseller/YYMMDDmw.txt`

---

## Overview

This plan outlines the comprehensive steps required to add MIBA as the 9th regional association to the Better Bests application. Additionally, it addresses an existing bug where SIBA has inconsistent file codes across the system.

### Current State
- **8 Regional Associations:** PNBA, CALIBAN, CALIBAS, GLIBA, MPIBA, NAIBA, NEIBA, SIBA
- **Critical Bug:** SIBA uses `file_code: 'si'` in frontend but `region_code: 'se'` in database

### Target State
- **9 Regional Associations:** Add MIBA to existing 8
- **Bug Fixed:** SIBA standardized to `'si'` throughout system
- **Historical Data:** Past 52 weeks of MIBA data backfilled
- **Full Integration:** MIBA appears in all UI components and features

---

## Phase 1: Database Schema Updates

### 1.1 Create Migration: Add MIBA & Fix SIBA

**File:** `supabase/migrations/[timestamp]_add_miba_fix_siba.sql`

**Actions:**
1. Insert MIBA into `regions` table
   - `abbreviation`: 'MIBA'
   - `full_name`: 'Midwest Independent Booksellers Association'
   - `region_code`: 'mw'
   - `is_active`: true
   - `display_order`: 9

2. Update SIBA in `regions` table
   - Change `region_code` from 'se' to 'si'
   - Ensure consistency with frontend

3. Update any foreign key references if needed

**SQL Template:**
```sql
-- Add MIBA
INSERT INTO regions (abbreviation, full_name, region_code, is_active, display_order)
VALUES ('MIBA', 'Midwest Independent Booksellers Association', 'mw', true, 9);

-- Fix SIBA code inconsistency
UPDATE regions
SET region_code = 'si'
WHERE abbreviation = 'SIBA';
```

**Verification:**
- Run `SELECT * FROM regions ORDER BY display_order;`
- Confirm 9 regions exist
- Verify SIBA shows 'si' and MIBA shows 'mw'

---

## Phase 2: Frontend Configuration

### 2.1 Update Region Configuration

**File:** `src/config/regions.ts`

**Actions:**
- Add MIBA object to the `REGIONS` array
- Position after MPIBA (display_order: 9)
- Include all required fields

**MIBA Configuration:**
```typescript
{
  abbreviation: 'MIBA' as const,
  display_name: 'MIBA - Midwest',
  full_name: 'Midwest Independent Booksellers Association',
  file_code: 'mw',
  is_active: true,
  display_order: 9,
  website_url: 'https://www.midwestbooksellers.org/' // Verify actual URL
}
```

**Verification:**
- Confirm SIBA entry already uses `file_code: 'si'` (should be correct)
- Ensure display_order is sequential

### 2.2 Update Type Definitions

**File:** `src/types/region.ts`

**Actions:**
- Add 'MIBA' to `REGION_ABBREVIATIONS` array (source of truth)
- The `RegionAbbreviation` union type will update automatically (it's derived from the array)
- Update validation functions if they use hardcoded lists

**Type Update:**
```typescript
export const REGION_ABBREVIATIONS = [
  'PNBA',
  'CALIBAN',
  'CALIBAS',
  'GLIBA',
  'MPIBA',
  'MIBA',    // NEW
  'NAIBA',
  'NEIBA',
  'SIBA',
] as const;

// This type is automatically derived from the array above
export type RegionAbbreviation = typeof REGION_ABBREVIATIONS[number];
```

**Verification:**
- TypeScript should compile without errors
- `isValidRegion('MIBA')` should return true

---

## Phase 3: Edge Functions Updates

### 3.1 Update Primary Data Fetcher

**File:** `supabase/functions/populate-regional-bestsellers/index.ts`

**Actions:**
- Add MIBA to the hardcoded `regions` array (around line 40-50)
- Ensure URL construction includes 'mw' code

**MIBA Entry:**
```typescript
{
  abbreviation: 'MIBA',
  file_code: 'mw',
  full_name: 'Midwest Independent Booksellers Association'
}
```

**URL Pattern Verification:**
- Function should construct: `https://www.bookweb.org/sites/default/files/regional_bestseller/251203mw.txt`

**Rate Limiting Configuration:**
- **KEEP current 500ms delay** - DO NOT change to 2000ms
- **Reason**: 2000ms causes timeout issues for multi-week backfills
  - 4 weeks × 9 regions × 2s = 72 seconds > 60s Supabase edge function limit
  - Any backfill >3 weeks would fail with 2000ms delay
- **Alternative**: If rate limiting becomes an issue, refactor to process per-week iterations

### 3.2 Update Legacy Edge Function

**File:** `supabase/functions/fetch-regional-lists/index.ts`

**Actions:**
- Add MIBA entry to region mappings: `'MIBA': '...250723mw.txt'`
- Fix SIBA from 'so' to 'si' (existing bug on line 26)
  - Current (wrong): `250723so.txt`
  - Correct: `250723si.txt`

**Note:** This is a legacy function with hardcoded dates and outdated codes. Both MIBA addition and SIBA fix are required for consistency with BookWeb.org URL patterns.

### 3.3 Update CORS Proxy

**File:** `supabase/functions/fetch-bestseller-file/index.ts`

**Actions:**
- Verify validation logic allows MIBA URLs
- Should be automatic if using pattern-based validation
- Test with: `https://www.bookweb.org/sites/default/files/regional_bestseller/251203mw.txt`

---

## Phase 4: Historical Data Backfill

### 4.1 Create Dedicated MIBA Backfill Script

**File:** `scripts/backfill-miba-historical.js`

**Purpose:** Fetch past 52 weeks of MIBA data (approximately 1 year)

**Features:**
1. **Rate Limiting:** 500ms delay between requests (consistent with edge function)
2. **Progress Tracking:** Log each week processed
3. **Error Handling:** Retry logic for failed requests
4. **Resume Capability:** Track last successful week
5. **Dry Run Mode:** Test without database writes

**Key Parameters:**
- Start date: Calculate 52 weeks back from today
- End date: Today
- Region: MIBA only
- Rate limit: 500ms between requests (consistent with edge function)
- Batch size: Match existing system (1000 books per batch)

**Estimated Runtime:**
- 52 weeks × 0.5 seconds = 26 seconds
- Add processing time: ~2-3 minutes total

**Script Structure:**
```javascript
// Calculate date range (52 weeks back)
// Loop through each week
//   - Construct URL with YYMMDD + 'mw'
//   - Call populate-regional-bestsellers edge function
//   - Wait 500ms (rate limit)
//   - Log progress
//   - Handle errors
// Report final statistics
```

### 4.2 Update Existing Populate Script

**File:** `scripts/populate-regional-data.js`

**Actions:**
- Verify script automatically includes MIBA (should pull from edge function)
- Test that manual population includes all 9 regions
- Update any hardcoded region lists

---

## Phase 5: Parser & Service Updates

### 5.1 Verify Bestseller Parser

**File:** `src/utils/bestsellerParser.ts` *(Corrected path)*

**Actions:**
- Confirm parser handles MIBA format (should match other regions)
- Verify URL construction at key locations (search for 'bookweb.org' patterns)
- No code changes expected - parser should be region-agnostic

**Testing:**
- Parse sample MIBA file (251203mw.txt)
- Verify all 10 categories are extracted correctly
- Confirm ISBN, price, author, publisher parsing

### 5.2 Update Service Files

**Files to Check:**
1. `src/services/elsewhereService.ts`
   - Ensure queries include MIBA in cross-region lookups
   - Verify filtering logic handles 9 regions

2. `src/services/uniqueBooksService.ts`
   - Include MIBA in region exclusivity calculations
   - Update any hardcoded region counts

**Testing:**
- "Elsewhere" feature shows MIBA books
- "Unique to region" calculations include MIBA

---

## Phase 6: UI Component Verification

### 6.1 Auto-Updated Components

These components pull from `src/config/regions.ts` and should automatically include MIBA:

- `src/components/RegionSelector.tsx` - Dropdown selector
- `src/components/RegionalStats.tsx` - Statistics display
- `src/components/RegionalBreakdown.tsx` - Performance breakdown
- `src/components/RegionalHeatMap.tsx` - Visual representation
- `src/components/RegionRow.tsx` - Individual region rows
- `src/components/RegionalTabs.tsx` - Year-end tabs
- `src/pages/Elsewhere.tsx` - Cross-region discovery
- `src/pages/RegionUnique.tsx` - Region-exclusive books
- `src/pages/Awards.tsx` - Year-end rankings

### 6.2 Manual Verification Checklist

- [ ] MIBA appears in region selector dropdown
- [ ] `/region/MIBA` route works and displays data
- [ ] Regional stats calculate correctly for MIBA
- [ ] Heat map includes MIBA visualization
- [ ] "Elsewhere" feature shows MIBA books when viewing other regions
- [ ] "Unique" page works for MIBA filter
- [ ] Year-end rankings (/review/2025) include MIBA category
- [ ] Book detail pages show MIBA regional performance

### 6.3 React Hooks Verification

**Files:**
- `src/hooks/useRegionalHistory.ts` - Should fetch MIBA history
- `src/hooks/useBookRegionalPerformance.ts` - Include MIBA metrics
- `src/hooks/useYearEndRankings.ts` - Include MIBA in rankings
- `src/hooks/useUniqueBooks.ts` - Handle MIBA filtering

**Testing:** Verify hooks return MIBA data when queried

---

## Phase 7: Data Population & Verification

### 7.1 Deployment Sequence

**Step 1: Database Migration**
```bash
supabase db push
```
- Verify migration succeeds
- Check `regions` table has 9 entries
- Confirm SIBA code updated to 'si'

**Step 2: Deploy Edge Functions**
```bash
supabase functions deploy populate-regional-bestsellers
supabase functions deploy fetch-regional-lists
```
- Verify deployments succeed
- Test edge function with dry run mode

**Step 3: Run Backfill Script**
```bash
node scripts/backfill-miba-historical.js
```
- Monitor progress logs
- Verify no errors
- Estimated time: 3-5 minutes

**Step 4: Verify Data**
```sql
SELECT region, COUNT(*) as book_count, MIN(week_date) as earliest, MAX(week_date) as latest
FROM regional_bestsellers
WHERE region = 'MIBA'
GROUP BY region;
```
Expected: ~5,200 records spanning 52 weeks

### 7.2 Ongoing Updates

**Cron Job Verification:**
- File: `supabase/migrations/20251202_add_regional_cron.sql`
- Scheduled: Wednesdays at 17:15 UTC + 17:45 UTC (retry)
- Action: Verify cron includes MIBA (should be automatic)

**Manual Test:**
```bash
# Trigger current week population
supabase functions invoke populate-regional-bestsellers
```

---

## Phase 8: Testing Checklist

### Database Tests
- [ ] MIBA exists in `regions` table with correct attributes
- [ ] SIBA `region_code` corrected to 'si'
- [ ] MIBA data exists in `regional_bestsellers` table
- [ ] Historical data spans 52 weeks
- [ ] No duplicate entries (region, isbn, week_date)
- [ ] All indexes perform efficiently

### Backend Tests
- [ ] Edge function fetches MIBA data successfully
- [ ] Parser handles MIBA file format correctly
- [ ] Rate limiting works (500ms between requests)
- [ ] Cron job includes MIBA in weekly updates
- [ ] Error handling works for missing/malformed files

### Frontend Tests
- [ ] MIBA appears in region selector dropdown
- [ ] `/region/MIBA` page loads and displays data
- [ ] Regional stats show MIBA metrics
- [ ] Charts and graphs include MIBA
- [ ] "Elsewhere" includes MIBA books
- [ ] "Unique to MIBA" page works
- [ ] Year-end rankings include MIBA (/review/2025)
- [ ] Book detail pages show MIBA performance history

### Integration Tests
- [ ] Search across all regions includes MIBA
- [ ] Region filtering works on all pages
- [ ] Cross-region comparisons include MIBA
- [ ] Regional performance calculations include MIBA

### Performance Tests
- [ ] Page load times acceptable with 9 regions
- [ ] Database queries perform well with additional data
- [ ] Regional filters don't cause slowdowns

---

## Files to Modify (Complete List)

### New Files
1. `supabase/migrations/[timestamp]_add_miba_fix_siba.sql` - Migration
2. `scripts/backfill-miba-historical.js` - Historical data backfill
3. `docs/MIBA_IMPLEMENTATION_PLAN.md` - This document

### Modified Files
1. `src/config/regions.ts` - Add MIBA configuration
2. `src/types/region.ts` - Add to REGION_ABBREVIATIONS array
3. `supabase/functions/populate-regional-bestsellers/index.ts` - Add MIBA (rate limit unchanged at 500ms)
4. `supabase/functions/fetch-regional-lists/index.ts` - Add MIBA, fix SIBA code from 'so' to 'si'
5. `scripts/populate-regional-data.js` - Verify includes MIBA

### Files to Verify (No Changes Expected)
- All UI components (should auto-update from config)
- All hooks (should handle 9 regions automatically)
- Parser service (should handle MIBA format)
- Database tables (schema accommodates new region)

---

## Rollback Plan

If issues arise, rollback in reverse order:

**Step 1: Stop Data Population**
- Disable cron job temporarily
- Stop any running backfill scripts

**Step 2: Remove MIBA Data**
```sql
DELETE FROM regional_bestsellers WHERE region = 'MIBA';
DELETE FROM regions WHERE abbreviation = 'MIBA';
```

**Step 3: Revert Edge Functions**
- Redeploy previous version without MIBA

**Step 4: Revert Frontend**
- Remove MIBA from config and types
- Redeploy application

**Note:** SIBA fix should NOT be rolled back as it corrects an existing bug

---

## Risk Assessment

### Low Risk
- Adding MIBA is purely additive
- No breaking changes to existing functionality
- Database schema already supports multiple regions
- UI components are data-driven

### Medium Risk
- Large historical backfill (52 weeks × ~100 books)
- Rate limiting on BookWeb.org
- Potential for incomplete historical data

### Mitigation Strategies
1. **Rate Limiting:** 2-second delays between requests
2. **Resume Capability:** Track progress, allow restart from failure point
3. **Dry Run:** Test backfill without database writes first
4. **Monitoring:** Log all operations for debugging
5. **Staged Rollout:** Deploy database → edge functions → frontend → backfill

---

## Success Criteria

### Must Have (Blocking)
- ✅ MIBA appears in database `regions` table
- ✅ MIBA data fetches successfully from BookWeb.org
- ✅ MIBA appears in all UI dropdowns and selectors
- ✅ `/region/MIBA` page works
- ✅ SIBA code inconsistency fixed

### Should Have (Important)
- ✅ 52 weeks of historical data backfilled
- ✅ Cron job includes MIBA in weekly updates
- ✅ "Elsewhere" and "Unique" features include MIBA
- ✅ Year-end rankings include MIBA

### Nice to Have (Enhancement)
- ✅ Performance metrics for MIBA
- ✅ Regional comparison charts include MIBA
- ✅ MIBA-specific analytics

---

## Timeline Estimate

**Phase 1-2 (Config & Database):** 30 minutes
- Create migration
- Update config files
- Update types

**Phase 3 (Edge Functions):** 30 minutes
- Update 3 edge functions
- Test locally
- Deploy

**Phase 4 (Backfill Script):** 45 minutes
- Write script
- Test dry run
- Execute backfill (~2-3 minutes)
- Verify data

**Phase 5-6 (Services & UI):** 30 minutes
- Verify parsers
- Test UI components
- Manual testing

**Phase 7-8 (Verification & Testing):** 1 hour
- Run full test suite
- Manual QA
- Performance testing

**Total Estimated Time:** 3 - 3.5 hours

---

## Notes & Considerations

### SIBA Code Fix
The inconsistency exists in multiple places:
- **Correct code ('si')**: populate-regional-bestsellers edge function, src/config/regions.ts, BookWeb.org URLs
- **Incorrect code ('so')**: fetch-regional-lists legacy function (line 26)
- **Database inconsistency**: Originally had 'se', needs migration to 'si'

The frontend and primary edge function already use 'si' (correct). The legacy function needs updating from 'so' to 'si'. Database migration will standardize to 'si' throughout.

### MIBA Website
Verify the actual MIBA website URL before deployment. Placeholder used: `https://www.midwestbooksellers.org/`

### Rate Limiting Decision
Keeping 500ms delay (not changing to 2000ms) to avoid edge function timeouts. Impact on cron job: ~4.5 seconds for 9 regions. Multi-week backfills remain viable within Supabase's 60-second execution limit (e.g., 4 weeks × 9 regions × 0.5s = 18 seconds + processing time).

### Historical Data Gaps
If any weekly files are missing from BookWeb.org, the script should log and continue. Not all 52 weeks may be available.

### Future Considerations
- Monitor MIBA data quality over first few weeks
- Consider adding website scraping if file format changes
- Plan for potential 10th region in future (scalability)

---

## Approval & Sign-off

**Plan Created By:** Claude Code
**Plan Date:** December 3, 2025
**Status:** Awaiting Approval

**Approved By:** _________________
**Approval Date:** _________________

**Deployment Date:** _________________
**Deployment By:** _________________

---

## Post-Implementation Review

*To be completed after deployment*

**Deployment Date:** _________________
**Issues Encountered:** _________________
**Resolution Time:** _________________
**Data Quality:** _________________
**Performance Impact:** _________________
**User Feedback:** _________________

---

*End of Plan*
