# Review Page Refactor: Multi-Year Support

## Problem

The `/review/2025` page currently shows hardcoded 2025 data with static stats (52 weeks, 847 books). As we enter 2026, we need:

- `/review/2025` to be a frozen historical archive
- `/review/2026` (and `/review`) to show live year-to-date rankings
- Automatic year detection so no code changes are needed each January

## Approach

Minimal UI refactor (Approach A). The database already partitions by year — `book_performance_metrics` uses `(isbn, year)` PK and `book_regional_performance` uses `(isbn, region, year)` PK. The `useYearEndRankings` hook already accepts a `year` parameter. Changes are concentrated in the UI layer.

## Design

### Routing & Year Detection

- `ReviewDefaultRedirect` in `App.tsx`: redirect `/review` to `/review/{currentYear}` using `new Date().getFullYear()`
- `Awards.tsx` default year: fallback to `new Date().getFullYear()` instead of `2025`
- `useYearEndRankings` default: change from `year = 2025` to `year = new Date().getFullYear()`
- `FRONTLIST_YEARS`: compute dynamically as `[currentYear - 1, currentYear]`
- No route structure changes needed

### Year Tabs

New `YearTabs` component placed between the header and HeroSection. Renders a tab for each year that has data, determined by querying distinct years from `book_performance_metrics`. Current year selected based on URL param. Clicking a tab navigates to `/review/{year}` preserving category/region. Chronological order (oldest left, newest right).

### HeroSection Changes

- New `isComplete` prop: `true` when `year < currentYear`, `false` otherwise
- Year badge: "2025" for complete years, "2026 Year to Date" for current year
- Weeks stat subtext: "Weeks" for complete years, "Weeks So Far" for current year
- All stats (weeks, books, regions) fetched dynamically instead of hardcoded

### Category Disclaimers

When `isComplete === false && weeksOfData < 52`, an inline note appears below each category heading: "Based on {N} weeks of data. Rankings may shift as the year progresses." Styled as subtle `text-muted-foreground` with info icon.

### New Hooks

- `useAvailableYears`: `SELECT DISTINCT year FROM book_performance_metrics ORDER BY year`. Cached 24h.
- `useYearStats(year)`: queries `weekly_scores` for `COUNT(DISTINCT week_date)` and `book_performance_metrics` for `COUNT(DISTINCT isbn)` for the given year. Returns `{ weeksOfData, totalBooks }`.

## Files

### New (3)

- `src/hooks/useAvailableYears.ts`
- `src/hooks/useYearStats.ts`
- `src/components/YearEndRankings/YearTabs.tsx`

### Modified (4)

- `src/App.tsx` — dynamic year redirect
- `src/pages/Awards.tsx` — YearTabs integration, dynamic stats, disclaimers, dynamic FRONTLIST_YEARS
- `src/components/YearEndRankings/HeroSection.tsx` — `isComplete` prop, conditional rendering
- `src/hooks/useYearEndRankings.ts` — dynamic default year

### Unchanged

- Database schema
- Supabase cron jobs / aggregation logic
- CategoryNav, FrontlistToggle, EnhancedRankingCard, etc.
- All existing `/review/2025` URLs continue to work
