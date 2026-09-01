# Codebase Cleanup Pass

**Date:** 2026-02-28
**Context:** Audit in `docs/QUALITY.md` identified ~4,000 lines of dead code,
~24 unused npm dependencies, duplicated utilities, over-large files, and
scaffolding bloat. This design covers a full cleanup in three phases.

**Approach:** Layer cake. Each phase leaves the app in a working state and is
committed independently. If a later phase gets complicated, earlier phases are
already locked in.

**Verification after every phase:** `npm test -- --run && npm run build`

---

## Phase 1 — Deletion

Zero behavior change. Pure subtraction.

### Dead files to delete

| File | Reason |
|------|--------|
| `src/pages/FetchPreviousWeek.tsx` | Not in any route in App.tsx, zero imports |
| `src/components/FileUpload.tsx` | Never imported by any component |
| `src/nav-items.tsx` | Old route config, replaced by inline routes in App.tsx, zero imports |
| `src/constants/cacheKeys.ts` | Entire file has zero imports from any consumer |
| `src/lib/environment.ts` | Zero imports anywhere in codebase |
| `src/components/ui/sonner.tsx` | Mounted in App.tsx but the `toast` function from sonner is never called; remove `<Sonner />` from App.tsx |

### Unused UI components to delete

Delete every file in `src/components/ui/` that is not imported by application
code. Based on import analysis, the **keepers** are:

- `button.tsx` (13+ consumers)
- `card.tsx` (11+ consumers)
- `select.tsx` (6 consumers)
- `badge.tsx` (5 consumers)
- `input.tsx` (5 consumers)
- `table.tsx` (2 consumers)
- `label.tsx` (2 consumers)
- `tooltip.tsx` (1 consumer)
- `toast.tsx` + `toaster.tsx` (toast system)
- `use-toast.ts` (re-export, removed in Phase 2)
- `alert.tsx` (used by BestsellerTable)
- `collapsible.tsx` (used by BestsellerTable)
- `status/ErrorState.tsx`, `status/LoadingState.tsx`, `status/EmptyState.tsx`,
  `status/index.ts`

Everything else is deleted (~38 files), including the 600+ line `sidebar.tsx`.

### Unused npm dependencies to remove

**@radix-ui packages for deleted components:**
`@radix-ui/react-accordion`, `@radix-ui/react-alert-dialog`,
`@radix-ui/react-aspect-ratio`, `@radix-ui/react-avatar`,
`@radix-ui/react-checkbox`, `@radix-ui/react-context-menu`,
`@radix-ui/react-hover-card`, `@radix-ui/react-menubar`,
`@radix-ui/react-navigation-menu`, `@radix-ui/react-progress`,
`@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`,
`@radix-ui/react-slider`, `@radix-ui/react-switch`,
`@radix-ui/react-toggle`, `@radix-ui/react-toggle-group`

**Other unused packages:**
`embla-carousel-react`, `react-day-picker`, `input-otp`,
`react-resizable-panels`, `vaul`, `react-hook-form`,
`@hookform/resolvers`, `cmdk`, `sonner`

Before removing each package, verify it is not imported anywhere outside the
deleted UI components. Run `npm ls <package>` to check for transitive
dependencies.

### Broken npm scripts to remove

Remove from `package.json`:
- `test:a11y` — references `scripts/runAccessibilityAudit.mjs` (does not exist)
- `test:a11y:summary` — references `scripts/summarizeLighthouseReport.mjs`
  (does not exist)

### Dead code in googleBooksApi.ts

Delete ~180 lines of legacy cache functions that are defined but never called:
- `getSupabaseCachedCategory()` / `setSupabaseCachedCategory()`
- `getSupabaseCachedCover()` / `setSupabaseCachedCover()`
- `getSupabaseCachedPubDate()` / `setSupabaseCachedPubDate()`
- 3 legacy in-memory cache instances (`categoryCache`, `coverCache`,
  `pubDateCache`) labeled "kept for backward compatibility" but never written
  to by current code paths

### Phase 1 commit

Single commit: `chore: remove unused components, dependencies, and dead code`

---

## Phase 2 — Consolidation

Low-risk structural changes. Deduplication without changing behavior.

### Toast re-export cleanup

- Delete `src/components/ui/use-toast.ts` (3-line re-export shim)
- Update any remaining imports of `@/components/ui/use-toast` to import from
  `@/hooks/use-toast` directly
- Most consumers already import from `@/hooks/use-toast`; verify with grep

### Edge function shared utilities

Create `supabase/functions/_shared/` with shared modules extracted from the
duplicated code across edge functions:

```
supabase/functions/_shared/
  cors.ts       — corsHeaders object
  utils.ts      — getMostRecentWednesday(), formatAsYYMMDD(), normalizeIsbn()
  types.ts      — RegionalBook interface, shared types
  parser.ts     — parseRegionalList() and helpers (isCategoryHeader, isBookEntry, etc.)
  regions.ts    — REGIONS config array
```

Update each edge function to import from `_shared/` instead of defining its own
copy. Affected functions:
- `populate-regional-bestsellers/index.ts`
- `fetch-pnba-lists/index.ts`
- `fetch-regional-lists/index.ts`
- `calculate-weekly-scores/index.ts` (for `calculateScore`)

**Trigger.dev task exception:** The Trigger.dev task runs in Node.js, not Deno.
It cannot import from `supabase/functions/_shared/`. Accept this duplication
boundary between runtimes. Consolidate within each runtime only.

### bestsellerParser.ts internal duplicate

`ensureAudienceAssignment()` (lines 235-276) re-declares the same category
arrays and logic as `getDefaultAudience()`. Replace the duplicate with a call
to the existing function.

### Phase 2 commit

Single commit: `refactor: consolidate shared utilities and remove duplication`

---

## Phase 3 — Structural Refactoring

Medium-risk changes. Splitting large files and inlining tiny ones. Run tests
after each individual split.

### Split bestsellerParser.ts (1,233 lines -> 4 modules)

**`src/utils/bestsellerTextParser.ts`** — Pure parsing, no I/O:
- `parseList()`
- `isCategoryHeader()`
- `isBookEntry()`
- `parseBookEntryWithLookahead()`
- `isDetailLine()`
- `formatCategoryName()`

**`src/utils/bestsellerCache.ts`** — Supabase fetch_cache interactions:
- `getCachedData()`
- `setCachedData()`
- `isCurrentWeek()`
- `shouldFetchNewData()`
- `isRecentCache()`

**`src/services/bookDataService.ts`** — Audience + weeks-on-list data layer:
- `batchGetBookAudiences()`
- `fetchAudiencesFromDatabase()`
- `getBookAudience()`
- `updateBookAudience()`
- `getWeeksOnList()`
- `batchGetWeeksOnList()`
- `fetchWeeksOnListFromDatabase()`
- `saveToDatabase()`
- `getDefaultAudience()`

**`src/utils/bestsellerFetcher.ts`** — Orchestration:
- `fetchBestsellerData()` (the main public function)
- `fetchAndStoreWeek()`
- `fetchHistoricalData()`
- `compareLists()`
- `getBookHistory()`
- `getListUrls()`
- `fetchWithCorsProxy()`
- `isValidBestsellerContent()`

Re-export all public functions from `bestsellerParser.ts` (now a barrel file)
to avoid breaking existing imports. Remove the barrel file once all consumers
are updated.

Update `bestsellerParser.test.ts` imports accordingly.

### Split googleBooksApi.ts (900 lines -> 2 modules)

**`src/services/googleBooksCache.ts`** — Cache infrastructure:
- `GoogleBooksCache<T>` class
- `RequestQueue` class
- `fetchWithRetry()`
- Surviving Supabase cache helpers (`getSupabaseCachedBookInfo`,
  `setSupabaseCachedBookInfo`)

**`src/services/googleBooksApi.ts`** — Public API (imports from cache module):
- `fetchCachedBookInfo()`
- `fetchGoogleBooksCategory()`
- `fetchGoogleBooksCategoriesBatch()`
- `fetchGoogleBooksInfo()`
- `fetchGoogleBooksCoversBatch()`
- `fetchGoogleBooksPubDatesBatch()`
- `clearAllCaches()`

Update `googleBooksApi.test.ts` imports accordingly.

### Inline tiny BestsellerTable sub-components into BookRow.tsx

Merge these into `BookRow.tsx`:
- `BookInfoCell.tsx` (41 lines) — pure JSX, no logic
- `RankChangeCell.tsx` (57 lines) — simple conditional rendering
- `SwitchControls.tsx` (47 lines) — simple checkbox rendering

Delete the three files after inlining.

Keep as separate files (justified complexity):
- `BookRow.tsx` (will grow to ~200 lines after inlining, still reasonable)
- `CategoryHeader.tsx` (81 lines, has AlertDialog confirmation pattern)
- `TableHeader.tsx` (94 lines, has sort controls and bulk selection)

### Phase 3 commits

One commit per split to keep diffs reviewable:
1. `refactor: split bestsellerParser into focused modules`
2. `refactor: extract cache layer from googleBooksApi`
3. `refactor: inline small BestsellerTable sub-components into BookRow`

---

## Expected Outcome

| Metric | Before | After |
|--------|--------|-------|
| UI component files | 56 | ~18 |
| npm dependencies | ~58 | ~34 |
| Dead files | 6 | 0 |
| bestsellerParser.ts | 1,233 lines | 4 files, largest ~350 lines |
| googleBooksApi.ts | 900 lines | 2 files, largest ~450 lines |
| BestsellerTable files | 10 | 7 |
| Duplicated edge fn utilities | 4+ copies each | 1 shared copy |
| Toast systems | 2 | 1 |
| Feature flag systems | 2 | 1 |
| Lines removed (est.) | — | ~4,000 |

## Risks and Mitigations

**Risk:** Deleting a UI component that's actually used somewhere not caught by
grep (e.g., dynamic import, string reference).
**Mitigation:** `npm run build` after Phase 1 will fail on any missing import.

**Risk:** Edge function shared imports break Supabase deployment.
**Mitigation:** Test with `supabase functions serve` before committing Phase 2.
Supabase supports `_shared/` imports via relative paths.

**Risk:** Splitting bestsellerParser.ts breaks circular dependencies (e.g.,
cache module imports parser, parser imports cache).
**Mitigation:** The split follows a clear dependency direction: textParser has
no deps, cache has no app deps, bookDataService depends on neither parser
module, fetcher depends on all three. No cycles.

**Risk:** Inlining BestsellerTable sub-components makes BookRow.tsx too large.
**Mitigation:** The three inlined components total ~145 lines of simple JSX.
BookRow.tsx would grow from 116 to ~200 lines, well within reasonable bounds.
