# Codebase Cleanup Pass — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove ~4,000 lines of dead code, ~20 unused npm dependencies, and
duplicated utilities; split over-large files into focused modules. Write
regression tests first so the refactoring is provably safe.

**Architecture:** Four-phase layer cake. Phase 0 writes regression tests for
code we're about to move. Phase 1 is pure deletion (zero risk). Phase 2
consolidates duplicated code. Phase 3 splits large files. Each phase is
committed independently and verified with `npm test -- --run && npm run build`.

**Rollback policy:** Every commit is a clean checkpoint. If a phase fails
verification, `git reset --hard HEAD~1` reverts to the prior passing state. No
phase depends on uncommitted work from a prior phase.

**Exit criteria per phase:**

| Phase | Exit criteria |
|-------|---------------|
| 0 | `npx vitest --run` passes with new tests covering shouldFetchNewData, getCachedData/setCachedData error paths, batchGetBookAudiences, saveToDatabase, fetchWithRetry, fetchCachedBookInfo, cover/pubdate batches |
| 1 | `npm run build` succeeds AND `npx vitest --run` passes AND `git diff --stat` shows only deletions + package.json/lock changes |
| 2 | `npm run build` succeeds AND `npx vitest --run` passes AND each touched edge function compiles (`deno check`) |
| 3 | `npm run build` succeeds AND `npx vitest --run` passes AND smoke test script passes AND no barrel re-export has zero consumers |

**Tech Stack:** Vite/React/TypeScript SPA, Supabase Edge Functions (Deno),
Trigger.dev (Node), Vitest

**Design doc:** `docs/plans/2026-02-28-cleanup-pass-design.md`

---

## Phase 0: Regression Tests

Write tests for the untested functions that Phase 3 will move between files.
These tests document current behavior (including intentional error-swallowing)
and will catch regressions during the split.

Phase 1 and 2 don't need new tests — the build catches deletion errors, and
existing tests cover the consolidation targets.

### Task 1: Test bestsellerParser cache and fetch-decision logic

The cache functions and `shouldFetchNewData` are untested but will be extracted
to `bestsellerCache.ts` in Phase 3. Test them now.

**Files:**

- Modify: `src/utils/bestsellerParser.test.ts`

**Step 1: Write tests for `shouldFetchNewData`**

Add a new `describe('shouldFetchNewData')` block. This function has 4 code
paths that need coverage:

**Timezone note:** All dates in these tests use explicit UTC timestamps
(`new Date('2024-01-10T12:00:00Z')`) so they are deterministic regardless of
the CI runner's local timezone. The production code uses UTC internally for
Wednesday detection.

```typescript
describe('shouldFetchNewData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return true when no cached data exists', async () => {
    vi.setSystemTime(new Date('2024-01-10T12:00:00Z')); // Wednesday UTC
    // getCachedData returns null (default mock behavior)
    const result = await BestsellerParser.shouldFetchNewData('PNBA');
    expect(result).toBe(true);
  });

  it('should return true when cache is stale (> 7 days)', async () => {
    vi.setSystemTime(new Date('2024-01-18T12:00:00Z')); // Thursday UTC
    const staleDate = new Date('2024-01-09T12:00:00Z'); // 9 days ago
    supabaseClientMock.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: { last_fetched: staleDate.toISOString(), data: {} },
                error: null,
              })),
            })),
          })),
        })),
      })),
    });

    const result = await BestsellerParser.shouldFetchNewData('PNBA');
    expect(result).toBe(true);
  });

  it('should return false on non-Wednesday with fresh cache', async () => {
    vi.setSystemTime(new Date('2024-01-11T12:00:00Z')); // Thursday UTC
    const yesterday = new Date('2024-01-10T12:00:00Z');
    // Mock fresh cache... (adapt to existing mock pattern)
    // expect(result).toBe(false);
  });

  it('should return true on Wednesday when cache is from a previous day', async () => {
    vi.setSystemTime(new Date('2024-01-10T12:00:00Z')); // Wednesday UTC
    // Mock cache with last_fetched from Tuesday
    // expect(result).toBe(true);
  });

  it('should return false on Wednesday when already fetched today', async () => {
    vi.setSystemTime(new Date('2024-01-10T14:00:00Z')); // Wednesday afternoon UTC
    // Mock cache with last_fetched from same Wednesday morning
    // expect(result).toBe(false);
  });
});
```

Note: The Supabase mock in this test file uses `supabaseClientMock` with
`vi.hoisted`. Follow the existing mock pattern — the `from()` mock needs to
return a chainable query builder. Read the existing mock setup at the top of
the file and replicate the chain for `fetch_cache` table queries.

**Step 2: Write tests for error-swallowing in getCachedData and setCachedData**

These functions intentionally return `null` / `void` on error instead of
throwing. Verify this behavior is preserved:

```typescript
describe('getCachedData error handling', () => {
  it('should return null when Supabase returns an error', async () => {
    supabaseClientMock.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(() => Promise.resolve({
                data: null,
                error: { message: 'connection failed' },
              })),
            })),
          })),
        })),
      })),
    });

    const result = await BestsellerParser.getCachedData('test_key');
    expect(result).toBeNull();
  });

  it('should return null when query times out', async () => {
    vi.useFakeTimers();

    supabaseClientMock.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(() => new Promise(() => {})), // never resolves
            })),
          })),
        })),
      })),
    });

    const resultPromise = BestsellerParser.getCachedData('test_key');
    await vi.advanceTimersByTimeAsync(11_000); // advance past the 10s internal timeout
    const result = await resultPromise;
    expect(result).toBeNull();

    vi.useRealTimers();
  });
});

describe('setCachedData error handling', () => {
  it('should not throw when Supabase returns an error', async () => {
    supabaseClientMock.from.mockReturnValueOnce({
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: null,
            error: { message: 'write failed' },
          })),
        })),
      })),
    });

    // Should resolve without throwing
    await expect(
      BestsellerParser.setCachedData('test_key', { some: 'data' })
    ).resolves.toBeUndefined();
  });
});
```

**Step 3: Write tests for `isValidBestsellerContent`**

This is a static validation function that will move to the text parser module.
Check if it's publicly accessible (it may be a private/static method on
`BestsellerParser`). If it's not directly testable, test it indirectly through
`fetchBestsellerData` or note that it will become testable after extraction.

If accessible:

```typescript
describe('isValidBestsellerContent', () => {
  it('should reject content shorter than 100 characters', () => {
    expect(BestsellerParser.isValidBestsellerContent('short')).toBe(false);
  });

  it('should reject 404 error pages', () => {
    const html404 = '<html><body>404 Not Found - The page you requested was not found</body></html>';
    expect(BestsellerParser.isValidBestsellerContent(html404)).toBe(false);
  });

  it('should reject HTML content', () => {
    const html = '<html><head><title>Page</title></head><body>Content</body></html>';
    expect(BestsellerParser.isValidBestsellerContent(html)).toBe(false);
  });

  it('should accept valid bestseller list content', () => {
    const validContent = `PACIFIC NORTHWEST BOOKSELLERS ASSOCIATION BESTSELLERS
for the week ended Sunday, January 10, 2024

HARDCOVER FICTION
1. The House of Flame and Shadow
Sarah J. Maas, Bloomsbury, 9781635574043, $32.00
`.repeat(3); // Ensure > 100 chars

    expect(BestsellerParser.isValidBestsellerContent(validContent)).toBe(true);
  });
});
```

**Step 4: Run tests**

Run: `npx vitest --run src/utils/bestsellerParser.test.ts`
Expected: All existing + new tests pass.

---

### Task 2: Test bestsellerParser data service functions

The audience and weeks-on-list functions will move to `bookDataService.ts`.
Test them now.

**Files:**

- Modify: `src/utils/bestsellerParser.test.ts`

**Step 1: Write tests for `batchGetBookAudiences`**

```typescript
describe('batchGetBookAudiences', () => {
  it('should fetch audiences from database for uncached ISBNs', async () => {
    const mockAudiences = [
      { isbn: '9781111111111', audience: 'A' },
      { isbn: '9782222222222', audience: 'C' },
    ];

    supabaseClientMock.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() => Promise.resolve({ data: mockAudiences, error: null })),
      })),
    });

    const result = await BestsellerParser.batchGetBookAudiences(
      ['9781111111111', '9782222222222'],
      'PNBA'
    );

    expect(result['9781111111111']).toBe('A');
    expect(result['9782222222222']).toBe('C');
  });

  it('should return cached results on second call', async () => {
    // First call populates cache (mock DB response)
    supabaseClientMock.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() => Promise.resolve({
          data: [{ isbn: '9781111111111', audience: 'A' }],
          error: null,
        })),
      })),
    });

    await BestsellerParser.batchGetBookAudiences(['9781111111111'], 'PNBA');
    vi.clearAllMocks();

    // Second call should not query Supabase
    const result = await BestsellerParser.batchGetBookAudiences(
      ['9781111111111'],
      'PNBA'
    );

    expect(result['9781111111111']).toBe('A');
    expect(supabaseClientMock.from).not.toHaveBeenCalled();
  });

  it('should return empty object when database returns error', async () => {
    supabaseClientMock.from.mockReturnValueOnce({
      select: vi.fn(() => ({
        in: vi.fn(() => Promise.resolve({
          data: null,
          error: { message: 'query failed' },
        })),
      })),
    });

    const result = await BestsellerParser.batchGetBookAudiences(
      ['9781111111111'],
      'PNBA'
    );

    expect(result).toEqual({});
  });
});
```

**Step 2: Write tests for `saveToDatabase` error handling**

`saveToDatabase` intentionally does NOT throw on failure. Verify this:

```typescript
describe('saveToDatabase', () => {
  it('should not throw when edge function returns an error', async () => {
    supabaseClientMock.functions.invoke.mockResolvedValueOnce({
      data: null,
      error: { message: 'edge function failed' },
    });

    const mockList: BestsellerList = {
      title: 'Test',
      date: '2024-01-10',
      categories: [{
        name: 'Fiction',
        books: [{
          rank: 1,
          title: 'Test Book',
          author: 'Author',
          publisher: 'Publisher',
          isbn: '9781111111111',
          price: '$25.00',
        }],
      }],
    };

    // Should not throw
    await expect(
      BestsellerParser.saveToDatabase(mockList, new Date('2024-01-10'), 'PNBA')
    ).resolves.toBeUndefined();
  });
});
```

**Step 3: Run tests**

Run: `npx vitest --run src/utils/bestsellerParser.test.ts`
Expected: All existing + new tests pass.

---

### Task 3: Test googleBooksApi cache infrastructure

The `GoogleBooksCache` class, `RequestQueue`, and `fetchWithRetry` will move
to `googleBooksCache.ts`. Test them now.

**Files:**

- Modify: `src/services/googleBooksApi.test.ts`

**Step 1: Write tests for `fetchWithRetry`**

`fetchWithRetry` is not exported directly, but its behavior is observable
through the public API. Test it indirectly via `fetchGoogleBooksCategory`:

```typescript
describe('retry behavior', () => {
  it('should retry on 429 rate limit and succeed', async () => {
    const rateLimitError = new Error('429 Too Many Requests');
    (rateLimitError as any).status = 429;

    const mockResponse = {
      items: [{ volumeInfo: { categories: ['Fiction'] } }],
    };

    (global.fetch as any)
      .mockRejectedValueOnce(rateLimitError) // First attempt: rate limited
      .mockResolvedValueOnce({ ok: true, json: async () => mockResponse }); // Retry: success

    const result = await fetchGoogleBooksCategory('9780743273565');
    expect(result).toBe('Fiction');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should return Unknown after exhausting retries on persistent 429', async () => {
    const rateLimitError = new Error('429 Too Many Requests');
    (rateLimitError as any).status = 429;

    (global.fetch as any)
      .mockRejectedValue(rateLimitError); // All attempts fail

    const result = await fetchGoogleBooksCategory('9780743273565');
    expect(result).toBe('Unknown');
  });
});
```

**Step 2: Write tests for non-ok HTTP responses**

The existing tests only cover network errors (`fetch` rejects) and successful
responses. Test what happens with HTTP 500:

```typescript
describe('HTTP error responses', () => {
  it('should handle HTTP 500 from Google Books API', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await fetchGoogleBooksCategory('9780743273565');
    expect(result).toBe('Unknown');
  });

  it('should handle response with no items array', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}), // No items field at all
    });

    const result = await fetchGoogleBooksCategory('9780743273565');
    expect(result).toBe('Unknown');
  });
});
```

**Step 3: Write tests for `fetchCachedBookInfo` three-tier cache**

This is the main public function that orchestrates the cache layers. Test each
tier in isolation:

```typescript
describe('fetchCachedBookInfo', () => {
  it('should return data from in-memory cache on second call', async () => {
    const mockResponse = {
      items: [{
        volumeInfo: {
          title: 'Test Book',
          categories: ['Fiction'],
          imageLinks: { thumbnail: 'http://example.com/thumb.jpg' },
        },
      }],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    // First call: API
    const result1 = await fetchCachedBookInfo('9780743273565');
    expect(result1).toBeDefined();
    expect(result1?.title).toBe('Test Book');
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call: in-memory cache (no API call)
    const result2 = await fetchCachedBookInfo('9780743273565');
    expect(result2?.title).toBe('Test Book');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should return null for ISBN with no Google Books results', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [] }),
    });

    const result = await fetchCachedBookInfo('9999999999999');
    expect(result).toBeNull();
  });

  it('should convert http image URLs to https', async () => {
    const mockResponse = {
      items: [{
        volumeInfo: {
          imageLinks: { thumbnail: 'http://books.google.com/thumb.jpg' },
        },
      }],
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchCachedBookInfo('9780743273565');
    expect(result?.imageLinks?.thumbnail).toMatch(/^https:/);
  });
});
```

Note: `fetchCachedBookInfo` needs to be added to the import list at the top of
the test file.

**Step 4: Run tests**

Run: `npx vitest --run src/services/googleBooksApi.test.ts`
Expected: All existing + new tests pass.

---

### Task 4: Test googleBooksApi batch cover and pubdate functions

These batch functions will stay in `googleBooksApi.ts` after the split, but
they currently have zero coverage. Add basic smoke tests.

**Files:**

- Modify: `src/services/googleBooksApi.test.ts`

**Step 1: Write tests for `fetchGoogleBooksCoversBatch`**

```typescript
describe('fetchGoogleBooksCoversBatch', () => {
  it('should return cover URLs for valid ISBNs', async () => {
    const mockResponse = {
      items: [{
        volumeInfo: {
          imageLinks: { thumbnail: 'http://books.google.com/thumb.jpg' },
        },
      }],
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchGoogleBooksCoversBatch(['9780743273565']);
    expect(result['9780743273565']).toBeDefined();
    expect(result['9780743273565']).toMatch(/^https:/); // http->https conversion
  });

  it('should return undefined for ISBNs with no cover', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ volumeInfo: {} }] }),
    });

    const result = await fetchGoogleBooksCoversBatch(['9780743273565']);
    expect(result['9780743273565']).toBeUndefined();
  });
});
```

**Step 2: Write tests for `fetchGoogleBooksPubDatesBatch`**

```typescript
describe('fetchGoogleBooksPubDatesBatch', () => {
  it('should return publication dates for valid ISBNs', async () => {
    const mockResponse = {
      items: [{
        volumeInfo: { publishedDate: '2024-01-15' },
      }],
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await fetchGoogleBooksPubDatesBatch(['9780743273565']);
    expect(result['9780743273565']).toBe('2024-01-15');
  });

  it('should return undefined for ISBNs with no pub date', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ volumeInfo: {} }] }),
    });

    const result = await fetchGoogleBooksPubDatesBatch(['9780743273565']);
    expect(result['9780743273565']).toBeUndefined();
  });
});
```

Note: `fetchGoogleBooksCoversBatch` and `fetchGoogleBooksPubDatesBatch` need
to be added to the import list at the top of the test file.

**Step 3: Run tests**

Run: `npx vitest --run src/services/googleBooksApi.test.ts`
Expected: All existing + new tests pass.

---

### Task 5: Commit Phase 0

**Step 1: Run full test suite**

Run: `npx vitest --run`
Expected: All tests pass (existing 514 + new tests).

**Step 2: Commit**

```bash
git add src/utils/bestsellerParser.test.ts src/services/googleBooksApi.test.ts
git commit -m "test: add regression tests for cache, fetch-decision, and batch functions

Cover shouldFetchNewData (Wednesday logic, staleness, dedup),
getCachedData/setCachedData error paths, batchGetBookAudiences,
saveToDatabase error swallowing, fetchWithRetry rate-limit handling,
fetchCachedBookInfo three-tier cache, cover/pubdate batch functions,
and HTTP error responses. These tests serve as a regression suite
for the upcoming bestsellerParser and googleBooksApi refactoring."
```

**Rollback:** `git reset --hard HEAD~1` — only test files are affected, no
production code changes.

---

## Phase 1: Deletion

### Task 6: Delete dead application files

**Files:**

- Delete: `src/pages/FetchPreviousWeek.tsx`
- Delete: `src/components/FileUpload.tsx`
- Delete: `src/nav-items.tsx`
- Delete: `src/constants/cacheKeys.ts`
- Delete: `src/lib/environment.ts`

**Step 1: Delete the files**

```bash
rm src/pages/FetchPreviousWeek.tsx
rm src/components/FileUpload.tsx
rm src/nav-items.tsx
rm src/constants/cacheKeys.ts
rm src/lib/environment.ts
```

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Clean build with no import errors.

**Step 3: Verify tests pass**

Run: `npx vitest --run`
Expected: All tests pass.

---

### Task 7: Remove Sonner toast system

The app runs two toast libraries. Sonner is mounted in App.tsx but its `toast`
function is never called anywhere. The Radix toast (`@/hooks/use-toast`) is the
one actually used across 13+ files.

**Files:**

- Delete: `src/components/ui/sonner.tsx`
- Modify: `src/App.tsx` (remove Sonner import and `<Sonner />` element)

**Step 1: Delete sonner component**

```bash
rm src/components/ui/sonner.tsx
```

**Step 2: Remove Sonner from App.tsx**

Remove the import line:

```typescript
import { Toaster as Sonner } from "@/components/ui/sonner";
```

Remove the JSX element:

```tsx
<Sonner />
```

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Clean build.

---

### Task 8: Delete unused UI components

These components exist in `src/components/ui/` but are never imported by
application code. Delete them in one batch, then verify with build.

**Files to delete:**

```bash
rm src/components/ui/aspect-ratio.tsx
rm src/components/ui/avatar.tsx
rm src/components/ui/breadcrumb.tsx
rm src/components/ui/calendar.tsx
rm src/components/ui/carousel.tsx
rm src/components/ui/chart.tsx
rm src/components/ui/command.tsx
rm src/components/ui/context-menu.tsx
rm src/components/ui/dialog.tsx
rm src/components/ui/drawer.tsx
rm src/components/ui/form.tsx
rm src/components/ui/hover-card.tsx
rm src/components/ui/input-otp.tsx
rm src/components/ui/menubar.tsx
rm src/components/ui/pagination.tsx
rm src/components/ui/popover.tsx
rm src/components/ui/radio-group.tsx
rm src/components/ui/resizable.tsx
rm src/components/ui/scroll-area.tsx
rm src/components/ui/separator.tsx
rm src/components/ui/sidebar.tsx
rm src/components/ui/textarea.tsx
rm src/components/ui/toggle-group.tsx
rm src/components/ui/toggle.tsx
```

**Step 1: Delete all 24 files**

Run the `rm` commands above.

**Step 2: Verify build passes**

Run: `npm run build`
Expected: Clean build. If any file was actually imported, the build will fail
with a clear import error.

**Restore protocol:** If the build fails on a missing import, restore the file
with `git checkout HEAD -- <path>`, remove it from the delete list, and re-run
the build. Repeat until clean. Do NOT skip the build check — dynamic imports
and re-exports can hide dependencies that grep misses.

**Step 3: Verify tests pass**

Run: `npx vitest --run`
Expected: All tests pass.

---

### Task 9: Remove unused npm dependencies

Only remove packages that were exclusively used by the deleted UI component
files. For each package, verify no remaining code imports it before removing.

**Step 1: Identify removable packages**

For each candidate package, search for imports across the **entire** codebase —
not just `src/`. Tests, scripts, config files, and edge functions may also
import packages:

```bash
grep -r "from.*@radix-ui/react-aspect-ratio" --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.cjs" --include="*.json" .
```

Repeat for each package. If grep returns no results (ignoring `package.json`
and `node_modules/`), the package is safe to remove.

**Candidates (verify each before removing):**

```
@radix-ui/react-aspect-ratio
@radix-ui/react-avatar
@radix-ui/react-context-menu
@radix-ui/react-hover-card
@radix-ui/react-menubar
@radix-ui/react-radio-group
@radix-ui/react-toggle
@radix-ui/react-toggle-group
@hookform/resolvers
cmdk
embla-carousel-react
input-otp
react-day-picker
react-hook-form
react-resizable-panels
sonner
vaul
```

Also check these — they may have lost their only consumer:

```
@radix-ui/react-dialog
@radix-ui/react-popover
@radix-ui/react-scroll-area
@radix-ui/react-separator
@radix-ui/react-slider
```

**Step 2: Remove confirmed unused packages**

```bash
npm uninstall <package1> <package2> ...
```

Run all removals in a single `npm uninstall` command.

**Step 3: Verify build passes**

Run: `npm run build`
Expected: Clean build.

**Step 4: Verify tests pass**

Run: `npx vitest --run`
Expected: All tests pass.

---

### Task 10: Remove dead code from googleBooksApi.ts

The file contains ~180 lines of legacy cache functions that are defined but
never called by current code paths.

**Files:**

- Modify: `src/services/googleBooksApi.ts`

**Step 1: Identify dead code**

Search for usages of each legacy function within the file and across the
codebase. These should have zero callers:

- `getSupabaseCachedCategory` / `setSupabaseCachedCategory`
- `getSupabaseCachedCover` / `setSupabaseCachedCover`
- `getSupabaseCachedPubDate` / `setSupabaseCachedPubDate`
- `categoryCache` (legacy in-memory cache instance)
- `coverCache` (legacy in-memory cache instance)
- `pubDateCache` (legacy in-memory cache instance)

Verify each with grep before deleting.

**Step 2: Delete legacy Supabase cache functions**

Remove the 6 functions and 3 cache instances. Leave the unified
`getSupabaseCachedBookInfo`/`setSupabaseCachedBookInfo` and `bookInfoCache`
which are the active code paths.

**Step 3: Verify tests pass**

Run: `npx vitest --run src/services/googleBooksApi.test.ts`
Expected: All tests pass.

Run: `npm run build`
Expected: Clean build.

---

### Task 11: Remove broken npm scripts

**Files:**

- Modify: `package.json`

**Step 1: Remove broken scripts**

Remove these two lines from the `"scripts"` section of `package.json`:

```json
"test:a11y": "node scripts/runAccessibilityAudit.mjs",
"test:a11y:summary": "node scripts/summarizeLighthouseReport.mjs",
```

**Step 2: Verify package.json is valid**

Run: `npm run build`
Expected: Clean build.

---

### Task 12: Commit Phase 1

**Step 1: Review changes**

```bash
git diff --stat
git status
```

Verify only expected files are deleted/modified. `git diff --stat` should show
only deletions and package.json/lock modifications — no new files, no
production logic changes.

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove unused components, dependencies, and dead code

Delete 30+ unused shadcn/ui components and their npm dependencies.
Remove dead files: FetchPreviousWeek, FileUpload, nav-items, cacheKeys,
environment.ts. Remove Sonner toast system (keeping Radix toast).
Remove legacy cache functions from googleBooksApi.ts.
Remove broken test:a11y scripts."
```

**Rollback:** `git reset --hard HEAD~1` — restores all deleted files and
reverts package.json. Then `npm install` to restore node_modules.

---

## Phase 2: Consolidation

### Task 13: Delete use-toast re-export shim

**Files:**

- Delete: `src/components/ui/use-toast.ts`

**Step 1: Verify no consumers**

```bash
grep -r "components/ui/use-toast" src/ --include="*.ts" --include="*.tsx"
```

Expected: No results (all consumers already import from `@/hooks/use-toast`).

If any results found, update those imports to `@/hooks/use-toast` first.

**Step 2: Delete the file**

```bash
rm src/components/ui/use-toast.ts
```

**Step 3: Verify**

Run: `npm run build && npx vitest --run`
Expected: All pass.

---

### Task 14: Fix internal duplicate in bestsellerParser.ts

`ensureAudienceAssignment()` (around line 235) re-declares the same category
arrays and logic as `getDefaultAudience()`.

**Files:**

- Modify: `src/utils/bestsellerParser.ts`

**Step 1: Read both functions**

Read `getDefaultAudience()` and `ensureAudienceAssignment()` to confirm they
implement the same logic.

**Step 2: Replace the duplicate**

Replace the body of `ensureAudienceAssignment()` to call `getDefaultAudience()`
instead of re-implementing it. Keep the function signature and any additional
side effects (e.g., database writes) that `ensureAudienceAssignment` does beyond
just computing the audience.

**Step 3: Verify**

Run: `npx vitest --run src/utils/bestsellerParser.test.ts`
Expected: All tests pass.

---

### Task 15: Create edge function shared utilities

**Files:**

- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/utils.ts`
- Create: `supabase/functions/_shared/types.ts`
- Create: `supabase/functions/_shared/parser.ts`
- Create: `supabase/functions/_shared/regions.ts`

**Step 1: Create the _shared directory**

```bash
mkdir -p supabase/functions/_shared
```

**Step 2: Extract cors.ts**

```typescript
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};
```

**Step 3: Extract utils.ts**

Copy `getMostRecentWednesday()`, `formatAsYYMMDD()`, and `normalizeIsbn()` from
any edge function (they're identical). Export all three.

**Step 4: Extract types.ts**

Copy the `RegionalBook` interface and any other shared types.

**Step 5: Extract parser.ts**

Copy `parseRegionalList()` and its helpers (`isCategoryHeader`, `isBookEntry`,
etc.) from `populate-regional-bestsellers/index.ts`.

**Step 6: Extract regions.ts**

Copy the `REGIONS` config array.

---

### Task 16: Update edge functions to use shared utilities

**Files:**

- Modify: `supabase/functions/populate-regional-bestsellers/index.ts`
- Modify: `supabase/functions/fetch-pnba-lists/index.ts`
- Modify: `supabase/functions/fetch-regional-lists/index.ts`
- Modify: `supabase/functions/calculate-weekly-scores/index.ts`
- Modify: any other edge function with duplicated utilities

**Step 1: Update each edge function**

For each function, replace inline utility definitions with imports:

```typescript
import { corsHeaders } from "../_shared/cors.ts";
import { getMostRecentWednesday, formatAsYYMMDD, normalizeIsbn } from "../_shared/utils.ts";
import { RegionalBook } from "../_shared/types.ts";
import { parseRegionalList } from "../_shared/parser.ts";
import { REGIONS } from "../_shared/regions.ts";
```

Remove the local definitions of each imported utility.

**Step 2: Verify each function still compiles**

Edge functions use Deno. Run a type-check on each touched function:

```bash
deno check supabase/functions/populate-regional-bestsellers/index.ts
deno check supabase/functions/fetch-pnba-lists/index.ts
deno check supabase/functions/fetch-regional-lists/index.ts
deno check supabase/functions/calculate-weekly-scores/index.ts
```

Each command must exit 0. If `deno` is not installed, use
`supabase functions serve <function-name> --no-verify-jwt` and verify it starts
without import errors, then stop it. Do not skip compile verification — this is
the only safety net for edge function changes.

Note: The Trigger.dev task (`trigger/populate-regional-bestsellers.ts`) runs in
Node.js and cannot import from `supabase/functions/_shared/`. Its duplication is
accepted at this boundary.

---

### Task 17: Commit Phase 2

**Step 1: Verify everything**

Run: `npm run build && npx vitest --run`
Expected: All pass.

Also verify edge functions compile (see Task 16 Step 2).

**Step 2: Commit**

```bash
git add -A
git commit -m "refactor: consolidate shared utilities and remove duplication

Create supabase/functions/_shared/ with cors, utils, types, parser, and
regions modules. Update edge functions to import shared code instead of
duplicating it. Remove use-toast re-export shim. Deduplicate
ensureAudienceAssignment in bestsellerParser."
```

**Rollback:** `git reset --hard HEAD~1` — restores inline utility definitions
in edge functions. No data migration involved.

---

## Phase 3: Structural Refactoring

### Task 18: Split bestsellerParser.ts — extract text parser

Extract the pure parsing functions with no I/O or side effects.

**Files:**

- Create: `src/utils/bestsellerTextParser.ts`
- Modify: `src/utils/bestsellerParser.ts`

**Step 1: Create bestsellerTextParser.ts**

Move these functions from `bestsellerParser.ts`:

- `parseList()`
- `isCategoryHeader()`
- `isBookEntry()`
- `parseBookEntryWithLookahead()`
- `isDetailLine()`
- `formatCategoryName()`

Include any types/interfaces these functions depend on. Export all functions.

**Step 2: Update bestsellerParser.ts**

Replace the moved functions with imports from `./bestsellerTextParser`.

**Step 3: Verify**

Run: `npx vitest --run src/utils/bestsellerParser.test.ts`
Expected: All tests pass (including the new Phase 0 tests).

---

### Task 19: Split bestsellerParser.ts — extract cache module

**Files:**

- Create: `src/utils/bestsellerCache.ts`
- Modify: `src/utils/bestsellerParser.ts`

**Step 1: Create bestsellerCache.ts**

Move these functions:

- `getCachedData()`
- `setCachedData()`
- `isCurrentWeek()`
- `shouldFetchNewData()`
- `isRecentCache()`

Include the Supabase client import and any types these depend on.

**Step 2: Update bestsellerParser.ts**

Replace moved functions with imports from `./bestsellerCache`.

**Step 3: Verify**

Run: `npx vitest --run src/utils/bestsellerParser.test.ts`
Expected: All tests pass (the Phase 0 `shouldFetchNewData` and
`getCachedData`/`setCachedData` error tests are the key regression checks here).

---

### Task 20: Split bestsellerParser.ts — extract book data service

**Files:**

- Create: `src/services/bookDataService.ts`
- Modify: `src/utils/bestsellerParser.ts`

**Step 1: Create bookDataService.ts**

Move these functions:

- `batchGetBookAudiences()`
- `fetchAudiencesFromDatabase()`
- `getBookAudience()`
- `updateBookAudience()`
- `getWeeksOnList()`
- `batchGetWeeksOnList()`
- `fetchWeeksOnListFromDatabase()`
- `saveToDatabase()`
- `getDefaultAudience()`

Include in-memory caches (audience cache, weeks cache) and their TTL constants.

**Step 2: Update bestsellerParser.ts**

Replace moved functions with imports from `@/services/bookDataService`.

**Step 3: Verify**

Run: `npx vitest --run src/utils/bestsellerParser.test.ts`
Expected: All tests pass (the Phase 0 `batchGetBookAudiences` and
`saveToDatabase` error tests are the key regression checks here).

Run: `npm run build`
Expected: Clean build (catches any broken imports from other consumers of these
functions).

---

### Task 21: Rename remaining bestsellerParser.ts

After Tasks 18-20, `bestsellerParser.ts` contains only the orchestration
functions. It is now the "fetcher."

**Files:**

- Rename: `src/utils/bestsellerParser.ts` -> `src/utils/bestsellerFetcher.ts`
- Rename: `src/utils/bestsellerParser.test.ts` -> `src/utils/bestsellerFetcher.test.ts`
- Create: `src/utils/bestsellerParser.ts` (barrel re-export for backward compat)

**Step 1: Rename the files**

```bash
mv src/utils/bestsellerParser.ts src/utils/bestsellerFetcher.ts
mv src/utils/bestsellerParser.test.ts src/utils/bestsellerFetcher.test.ts
```

**Step 2: Create barrel re-export**

Create `src/utils/bestsellerParser.ts` that re-exports everything:

```typescript
// Barrel re-export for backward compatibility.
// Consumers should migrate to importing from the specific modules directly.
export { BestsellerParser } from './bestsellerFetcher';
```

Add re-exports for any other public symbols from the split modules that
external consumers import via `bestsellerParser`.

**Step 3: Update test imports**

Update `bestsellerFetcher.test.ts` to import from `./bestsellerFetcher` and
from the new split modules as needed.

**Step 4: Verify**

Run: `npx vitest --run && npm run build`
Expected: All pass. No consumer code needs to change yet because the barrel
file preserves the old import path.

---

### Task 22: Commit bestsellerParser split

```bash
git add -A
git commit -m "refactor: split bestsellerParser into focused modules

Extract bestsellerTextParser (pure parsing, no I/O),
bestsellerCache (fetch_cache interactions),
bookDataService (audience/weeks data layer).
Rename remainder to bestsellerFetcher (orchestration).
Barrel re-export preserves backward compatibility."
```

**Rollback:** `git reset --hard HEAD~1` — restores monolithic
bestsellerParser.ts. The Phase 0 tests run against public API so they pass
in either state.

---

### Task 23: Split googleBooksApi.ts — extract cache layer

**Files:**

- Create: `src/services/googleBooksCache.ts`
- Modify: `src/services/googleBooksApi.ts`

**Step 1: Create googleBooksCache.ts**

Move these from `googleBooksApi.ts`:

- `GoogleBooksCache<T>` class
- `RequestQueue` class
- `fetchWithRetry()` function
- `bookInfoCache` instance
- `getSupabaseCachedBookInfo()` / `setSupabaseCachedBookInfo()`

Export all of them.

**Step 2: Update googleBooksApi.ts**

Replace moved code with imports from `./googleBooksCache`.

**Step 3: Verify**

Run: `npx vitest --run src/services/googleBooksApi.test.ts`
Expected: All tests pass (the Phase 0 retry, cache, and batch tests are the
key regression checks here).

Run: `npm run build`
Expected: Clean build.

---

### Task 24: Commit googleBooksApi split

```bash
git add -A
git commit -m "refactor: extract cache layer from googleBooksApi

Move GoogleBooksCache, RequestQueue, fetchWithRetry, and Supabase
cache helpers to googleBooksCache.ts. googleBooksApi.ts now contains
only the public API functions."
```

**Rollback:** `git reset --hard HEAD~1` — restores monolithic
googleBooksApi.ts. Phase 0 tests pass in either state.

---

### Task 25: Inline tiny BestsellerTable sub-components

**Files:**

- Modify: `src/components/BestsellerTable/BookRow.tsx`
- Delete: `src/components/BestsellerTable/BookInfoCell.tsx`
- Delete: `src/components/BestsellerTable/RankChangeCell.tsx`
- Delete: `src/components/BestsellerTable/SwitchControls.tsx`

**Step 1: Read all four files**

Read `BookRow.tsx`, `BookInfoCell.tsx`, `RankChangeCell.tsx`, and
`SwitchControls.tsx` to understand the current structure.

**Step 2: Inline BookInfoCell into BookRow**

Copy the JSX from `BookInfoCell` into `BookRow` where `<BookInfoCell>` is
currently rendered. Move any imports that BookInfoCell needs into BookRow.

**Step 3: Inline RankChangeCell into BookRow**

Same approach. Copy the conditional JSX inline.

**Step 4: Inline SwitchControls into BookRow**

Same approach. Copy the checkbox JSX inline.

**Step 5: Delete the three files**

```bash
rm src/components/BestsellerTable/BookInfoCell.tsx
rm src/components/BestsellerTable/RankChangeCell.tsx
rm src/components/BestsellerTable/SwitchControls.tsx
```

**Step 6: Verify**

Run: `npx vitest --run src/components/BestsellerTable`
Expected: All BestsellerTable tests pass.

Run: `npm run build`
Expected: Clean build.

---

### Task 26: Commit BestsellerTable cleanup

```bash
git add -A
git commit -m "refactor: inline small BestsellerTable sub-components into BookRow

Merge BookInfoCell (41 lines), RankChangeCell (57 lines), and
SwitchControls (47 lines) into BookRow. These were too small to
justify separate files. BookRow grows to ~200 lines."
```

**Rollback:** `git reset --hard HEAD~1` — restores the three sub-component
files and reverts BookRow.tsx.

---

### Task 27: Final verification

**Step 1: Run full test suite**

Run: `npx vitest --run`
Expected: All tests pass.

**Step 2: Run build**

Run: `npm run build`
Expected: Clean build.

**Step 3: Run lint**

Run: `npm run lint`
Expected: No new errors.

**Step 4: Run smoke test script**

Create and run a lightweight smoke test that verifies key runtime behavior
after the structural changes. This catches issues that unit tests and builds
miss (e.g., broken dynamic imports, missing re-exports at runtime):

```bash
# scripts/smoke-test.sh
#!/bin/bash
set -e

echo "Starting dev server..."
npm run dev &
DEV_PID=$!
sleep 5

echo "Checking app loads..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/)
if [ "$HTTP_STATUS" != "200" ]; then
  echo "FAIL: App returned HTTP $HTTP_STATUS"
  kill $DEV_PID
  exit 1
fi

echo "Checking JS bundle loads (no missing modules)..."
BODY=$(curl -s http://localhost:5173/)
# Vite injects script tags — verify no 404s on module imports
SCRIPT_SRC=$(echo "$BODY" | grep -oP 'src="(/[^"]+\.js)"' | head -1 | cut -d'"' -f2)
if [ -n "$SCRIPT_SRC" ]; then
  JS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5173$SCRIPT_SRC")
  if [ "$JS_STATUS" != "200" ]; then
    echo "FAIL: JS bundle returned HTTP $JS_STATUS"
    kill $DEV_PID
    exit 1
  fi
fi

echo "Smoke test passed."
kill $DEV_PID
```

Run: `bash scripts/smoke-test.sh`
Expected: Exits 0.

This script is disposable — commit it only if you want to keep it for future
use, otherwise delete after verification.

**Step 5: Manual spot-check (optional but recommended)**

Start dev server and verify:

- Main bestseller page loads and displays data
- Filtering works (adds, drops, audience)
- CSV/PDF export works
- Region switching works
- Book detail page loads

---

## Summary

| Phase | Tasks | Commits | Risk | Purpose |
|-------|-------|---------|------|---------|
| 0. Tests | 1-5 | 1 | Zero | Safety net for Phase 3 |
| 1. Deletion | 6-12 | 1 | Zero | Remove dead weight |
| 2. Consolidation | 13-17 | 1 | Low | Deduplicate |
| 3. Refactoring | 18-27 | 4 | Medium | Split large files |
| **Total** | **27** | **7** | | |
