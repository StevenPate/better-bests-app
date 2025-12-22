# Staging Data Maintenance

## Overview

This guide covers the maintenance and refresh procedures for synthetic test data in the staging environment.

**Purpose:** Ensure staging environment has realistic, up-to-date test data that covers all scenarios needed for safe feature testing.

## Refresh Schedule

### Monthly (1st of month)
- Review and refresh synthetic data
- Ensure multi-region scenarios covered
- Add new edge cases discovered in production
- Update data patterns to match current production schema

### After Schema Changes
- Immediately after migrations that affect data structure
- Verify all seed data still valid
- Add test cases for new columns/tables

### Before Major Features
- Prior to implementing multi-region expansion
- Before testing large-scale changes
- When adding new data-dependent features

## Multi-Region Parity Checklist

When refreshing staging data, ensure coverage of:

- [ ] **All 9 regions** (PNBA, SIBA, CALIBAN, CALIBAS, GLIBA, MPIBA, MIBA, NAIBA, NEIBA)
- [ ] **Books in multiple regional lists simultaneously** (e.g., same book on PNBA and SIBA)
- [ ] **Books unique to single regions** (for "Elsewhere" feature testing)
- [ ] **Regional adds/drops scenarios** (books new to one region, dropped from another)
- [ ] **Various audience classifications per region** (Adult, Teen, Children across regions)
- [ ] **Different list sizes per region** (some regions with 5 books, others with 50+)
- [ ] **Regional publication date variations** (not all regions publish on same day)

## Data Patterns to Include

### Edge Cases

**Title variations:**
- Very long titles (>100 characters)
- Titles with special characters (&, !, ?, quotes)
- Titles with colons and subtitles
- Non-English characters (accents, umlauts, etc.)

**Author variations:**
- Multiple authors (comma-separated)
- Authors with special characters (François, O'Brien, Müller)
- Corporate authors (organizations)
- "Unknown Author" cases

**ISBN variations:**
- 13-digit ISBNs (978...)
- 10-digit ISBNs (for legacy testing)
- Books without ISBNs (rare but possible)
- Invalid ISBN formats (for error handling)

**Category variations:**
- Standard categories (Hardcover Fiction, Paperback Nonfiction)
- Regional-specific categories
- Unusual category names
- Empty/null categories

**Regional variations:**
- Different regional list publication dates
- Region-specific bestseller patterns
- Books appearing in multiple regions at different ranks

### Volume Scenarios

**Small lists (5-10 books):**
- Test UI with minimal data
- Verify empty state handling
- Check performance with small datasets

**Medium lists (20-30 books):**
- Typical week's bestseller list
- Test pagination (if implemented)
- Verify filtering and sorting

**Large lists (50+ books):**
- Stress test UI rendering
- Check scroll performance
- Verify search functionality

### Temporal Scenarios

**Current week data:**
- Latest list (e.g., 2024-11-06)
- New books (is_new = true)
- Books that dropped (was_dropped = true)

**Historical data:**
- Previous week (for comparison)
- 4 weeks ago (for trend analysis)
- 52 weeks ago (for year-over-year)

**Switching data:**
- POS switches for current week
- Shelf switches for current week
- Historical switches for comparison

## Refresh Procedure

### Method 1: Using Supabase Dashboard (Recommended for Quick Updates)

1. **Navigate to SQL Editor:**
   ```
   Supabase Dashboard → SQL Editor → New query
   ```

2. **Copy and paste seed file contents:**
   ```
   Open: supabase/seed-staging.sql
   Copy entire file
   Paste into SQL Editor
   ```

3. **Execute:**
   ```
   Click "Run" or Ctrl+Enter
   ```

4. **Verify results:**
   - Check output for row counts
   - Navigate to Table Editor to spot-check data

### Method 2: Using Supabase CLI (Recommended for Full Reset)

1. **Link to staging:**
   ```bash
   supabase link --project-ref gyqbhphtgjlqczxhsoki
   ```

2. **Reset database (WARNING: Destructive):**
   ```bash
   # This will drop all data and reapply migrations
   supabase db reset
   ```

3. **Apply seed file via Dashboard:**
   - Since CLI doesn't have `execute --file`, use Dashboard method above

### Method 3: Using TypeScript Seeding Script (Future - Not Yet Implemented)

```bash
# Set staging credentials
export VITE_SUPABASE_URL="https://gyqbhphtgjlqczxhsoki.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-staging-service-key"

# Run seeding script
npm run seed:staging
```

**Note:** The TypeScript script (`scripts/seed-staging-data.ts`) is created but may need RPC function setup in Supabase to execute SQL. For now, use Dashboard method.

## Post-Refresh Verification

### Database Verification

Check row counts in Supabase Dashboard → Table Editor:

- [ ] `bestseller_list_metadata`: 6 rows (3 PNBA + 3 other regions)
- [ ] `book_positions`: ~20 rows (various books across weeks)
- [ ] `book_audiences`: 11 rows (A/T/C classifications)
- [ ] `bestseller_switches`: 3 rows (POS/shelf switches)
- [ ] `fetch_cache`: 2 rows (Google Books API cache)

### Multi-Region Coverage

Verify regional distribution:

```sql
SELECT region, COUNT(*) as book_count
FROM book_positions
WHERE week_date = '2024-11-06'
GROUP BY region
ORDER BY region;
```

Expected:
- PNBA: 10-15 books
- SIBA: 2-3 books
- CALIBAN: 1-2 books
- GLIBA: 1-2 books

### Audience Distribution

Verify audience coverage:

```sql
SELECT audience, COUNT(*) as count
FROM book_audiences
GROUP BY audience
ORDER BY audience;
```

Expected:
- A (Adult): 8-9 books
- T (Teen): 1-2 books
- C (Children): 1-2 books

### Adds/Drops

Verify adds/drops logic:

```sql
SELECT
  SUM(CASE WHEN is_new = true THEN 1 ELSE 0 END) as new_books,
  SUM(CASE WHEN was_dropped = true THEN 1 ELSE 0 END) as dropped_books
FROM book_positions
WHERE week_date = '2024-11-06';
```

Expected: At least 1 new book, at least 1 dropped book

## Application Testing

After refreshing data, test these features:

### Core Features
- [ ] Home page loads without errors
- [ ] All 9 regions appear in navigation (when multi-region enabled)
- [ ] Current week bestseller list displays correctly
- [ ] Filters work (adds/drops/all)
- [ ] Audience filters work (Adult/Teen/Children)
- [ ] Search functionality works

### Regional Features (When Multi-Region Enabled)
- [ ] Each region's list loads independently
- [ ] Book appears in multiple regions when expected
- [ ] "Elsewhere" page shows books unique to other regions
- [ ] Regional adds/drops show correctly

### Export Features
- [ ] PDF generation works for PNBA
- [ ] PDF includes correct books and metadata
- [ ] CSV export works for all export types (adds_no_drops, adds, drops)
- [ ] ISBN copying works

### Switching Features (PNBA Only)
- [ ] POS switches toggle correctly
- [ ] Shelf switches toggle correctly
- [ ] Switches persist across page reloads
- [ ] Switches scoped to correct list_date

## Troubleshooting

### Seed file fails to execute

**Symptom:** SQL errors when running seed file

**Causes:**
- Schema has changed since seed file was written
- Missing tables or columns
- Constraint violations (foreign keys, unique constraints)

**Fix:**
1. Review recent migrations
2. Update seed file to match current schema
3. Check for column name changes
4. Verify data types match

### Row count mismatch

**Symptom:** Fewer rows than expected after seeding

**Causes:**
- TRUNCATE didn't clear related tables
- Seed file had syntax errors (statements skipped)
- Constraints prevented inserts

**Fix:**
1. Check Supabase logs for errors
2. Manually verify table contents
3. Re-run seed file section by section

### Multi-region data missing

**Symptom:** Only PNBA data appears

**Causes:**
- Seed file only has PNBA entries
- Multi-region feature flag disabled

**Fix:**
1. Verify `VITE_ENABLE_MULTI_REGION=true` in `.env.staging`
2. Check seed file has regional_lists entries for all regions
3. Restart dev server after environment change

## Related Documentation

- [Supabase Migrations Guide](supabase-migrations.md) - Schema management
- [Environment Setup](../ENVIRONMENT_SETUP.md) - Environment configuration
- [Production Data Isolation Plan](../plans/2025-11-03-production-data-isolation.md) - Overall strategy
