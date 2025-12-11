# Performance Testing Guide - 100+ Book Datasets

This guide walks you through manually testing the application's performance with large datasets (100+ books).

## Prerequisites

- Application running (`npm run dev`)
- Browser DevTools open (Chrome/Firefox)
- Real PNBA bestseller data OR test data with 100+ books

## Test 1: PDF Generation Performance

### Setup
1. Navigate to the main bestseller page
2. Ensure you have a list with 100+ books loaded
3. Open DevTools Console
4. Open DevTools Performance tab

### Steps
1. Start recording in Performance tab
2. Click "PDF (all)" or "PDF (adds/drops)" button
3. Watch the progress indicator
4. Wait for PDF to download
5. Stop recording

### Success Criteria
- ✅ PDF generation completes in < 60 seconds
- ✅ Progress indicator shows smooth updates (0% → 100%)
- ✅ No browser freezing or UI lag during generation
- ✅ PDF file opens correctly with all books listed

### Metrics to Record
- Total duration (from click to download)
- Time in each phase (fetching, generating, saving)
- Books per second throughput
- Memory usage (check DevTools Memory tab)

## Test 2: Table Rendering Performance

### Setup
1. Navigate to bestseller page with 100+ books
2. Open DevTools Console
3. Run: `performance.mark('render-start')`

### Steps
1. Toggle between different filters:
   - Adult/Teen/Children audience
   - Adds/Drops/All books
2. Sort by title vs default order
3. Expand/collapse categories
4. Check/uncheck POS and Shelf boxes

### Success Criteria
- ✅ Filter changes render in < 200ms
- ✅ Sorting completes in < 100ms
- ✅ Checkbox updates feel instant (< 50ms)
- ✅ No visual lag when scrolling through large tables

### Measuring with Console
```javascript
// Measure filter change
performance.mark('filter-start');
// [Click a filter]
performance.mark('filter-end');
performance.measure('Filter Change', 'filter-start', 'filter-end');
console.table(performance.getEntriesByType('measure'));
```

## Test 3: Google Books Cache Hit Rate

### Setup
1. Open DevTools Network tab
2. Filter to show only Fetch/XHR requests
3. Navigate to bestseller page

### Steps - First Load
1. Clear browser cache (hard refresh)
2. Load bestseller list with 100+ books
3. Click "PDF (all)" button
4. Count requests to `googleapis.com/books`

### Steps - Second Load (Testing In-Memory Cache)
1. WITHOUT refreshing, click "PDF (all)" again
2. Count requests to `googleapis.com/books`
3. Should be ZERO (all from in-memory cache)

### Steps - Third Load (Testing Supabase Cache)
1. Refresh the page (clears in-memory cache)
2. Click "PDF (all)" button
3. Count requests to `googleapis.com/books`
4. Should be ZERO (all from Supabase cache)

### Steps - After 30 Days (Testing TTL)
1. This would require waiting 30 days OR
2. Manually delete Supabase cache entries
3. Verify API calls are made again

### Success Criteria
- ✅ First load: ~100 API requests (one per unique ISBN)
- ✅ Second load (same session): 0 API requests (in-memory cache hit)
- ✅ Third load (new session): 0 API requests (Supabase cache hit)
- ✅ Cache speedup: 50-100x faster (5000ms → 50ms)

## Test 4: Memory Leak Detection

### Setup
1. Open DevTools Memory tab
2. Take heap snapshot (Baseline)

### Steps
1. Generate PDF 5 times in a row
2. Change filters 20 times
3. Sort table 10 times
4. Take another heap snapshot (After)
5. Compare snapshots

### Success Criteria
- ✅ Memory increase < 10MB after multiple operations
- ✅ No detached DOM nodes in heap snapshot
- ✅ Memory returns to baseline after GC

## Test 5: Concurrent PDF Generation

### Setup
1. Open 3 browser tabs to the same bestseller list

### Steps
1. Click "PDF (all)" simultaneously in all 3 tabs
2. Observe progress indicators
3. Verify all complete successfully

### Success Criteria
- ✅ All PDFs generate successfully
- ✅ No race conditions or errors
- ✅ Supabase cache shared across tabs (check Network tab)

## Expected Results (Benchmarks)

Based on implementation optimizations:

| Metric | Target | Excellent | Good | Needs Work |
|--------|--------|-----------|------|------------|
| PDF Gen (120 books) | < 30s | < 20s | 20-40s | > 40s |
| Table Filter Change | < 200ms | < 100ms | 100-300ms | > 300ms |
| Table Sort | < 100ms | < 50ms | 50-150ms | > 150ms |
| Cache Hit Speedup | 50x+ | 100x+ | 20-50x | < 20x |
| Memory Usage | < 50MB | < 30MB | 30-70MB | > 70MB |

## Automated Testing (Future)

The `src/test/performanceTest.ts` file contains automated tests, but requires proper mocking setup. To run in the future:

```bash
npm run test:performance
```

## Recording Results

Document your findings in `docs/PERFORMANCE_TEST_RESULTS.md`:

```markdown
# Performance Test Results

**Date**: [DATE]
**Browser**: [Chrome 120 / Firefox 115 / etc]
**Dataset**: [120 books across 3 categories]

## PDF Generation
- Duration: X.Xs
- Throughput: XX books/s
- Status: [EXCELLENT/GOOD/NEEDS WORK]

## Table Rendering
- Filter change: XXms
- Sort operation: XXms
- Status: [EXCELLENT/GOOD/NEEDS WORK]

## Cache Performance
- First load: XXX requests, XXXXms
- Second load: 0 requests, XXms
- Speedup: XXx
- Status: [EXCELLENT/GOOD/NEEDS WORK]

## Notes
- [Any observations, issues, or recommendations]
```

## Troubleshooting

**PDF generation fails**:
- Check console for errors
- Verify Google Books API quota not exceeded
- Test with smaller dataset first (20-30 books)

**Table feels slow**:
- Check if browser extensions interfering
- Test in incognito mode
- Verify useMemo/useCallback optimizations in place

**Cache not working**:
- Check Supabase connection in console
- Verify `fetch_cache` table exists
- Check Network tab for failed DB requests
