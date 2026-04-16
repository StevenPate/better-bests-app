# Regional JSON Feeds — Design

**Status:** Design complete, ready for implementation plan
**Date:** 2026-04-15

## Goal

Publish a weekly JSON feed for each of the 9 regional associations at
`/region/{REGION}.json`, structurally identical to the national
`bestsellers.json` reference feed. Feeds serve dual purposes: public API for
third-party consumers (bookstores, partners) and internal data source for the
Better Bests SPA.

## Constraints

- **Schema fidelity:** Phase 1 must match the reference `bestsellers.json`
  exactly — same field names, same nesting, string-typed numerics. Non-negotiable
  because existing third-party sites already consume the reference format.
- **No new external APIs:** Use data already in the system (Supabase tables,
  Google Books cache).
- **Weekly update cadence:** Regenerated each Wednesday alongside the
  existing ingestion pipeline.

## Architecture

### Data flow

Phase 4 of the existing `populateRegionalBestsellers` Trigger.dev task:

1. For each region successfully ingested in Phase 1:
   1. Query `regional_bestsellers` for the current week.
   2. Query `regional_bestsellers` for the previous Wednesday.
   3. Call `get_weeks_on_list_batch_regional` RPC for all ISBNs.
   4. Batch-fetch Google Books descriptions from `fetch_cache` table.
   5. Construct BookSense cover image URLs from each ISBN.
   6. Assemble JSON matching reference structure.
   7. Upload to Supabase Storage bucket `feeds` at path `region/{REGION}.json`.
2. Log which regions generated feeds successfully. Failures for one region
   do not block others.

### Storage and serving

- **Bucket:** `feeds` (public Supabase Storage bucket, created once).
- **Paths:** `region/{ABBREVIATION}.json`, overwritten weekly.
- **Public URL pattern:** `https://<project>.supabase.co/storage/v1/object/public/feeds/region/{REGION}.json`
- **Netlify proxy:** `/region/:region.json` rewrites to the Supabase URL via
  `_redirects` rule with status `200` (rewrite, not redirect).
- **CORS:** Supabase public buckets serve with permissive CORS by default.
- **Cache:** Default `cache-control: max-age=3600` is sufficient for weekly
  updates.

## JSON Schema (Phase 1)

Exact match to reference `bestsellers.json`:

```json
{
  "title": "PNBA Indie Bestsellers for April 15th, 2026",
  "description": "For the week ending April 12th, 2026, based on sales in independent bookstores in the Pacific Northwest.",
  "for_date": "2026-04-15",
  "end_date": "2026-04-12",
  "sections": [
    {
      "title": "FICTION",
      "entries": [
        {
          "isbn": "9780593804216",
          "title": "Yesteryear",
          "author": "Caro Claire Burke",
          "publisher": "Knopf",
          "description": "A traditional American woman...",
          "blurb": "A traditional American woman...\nRank last week: NEW\nWeeks on list: 1",
          "small_image_uri": "https://images.booksense.com/images/books/216/804/FC9780593804216.JPG",
          "large_image_uri": "https://images.booksense.com/images/216/804/9780593804216.jpg",
          "rank": "1",
          "last": "NEW",
          "weeks_on_list": "1"
        }
      ]
    }
  ]
}
```

### Field mapping

| Field | Source | Notes |
|---|---|---|
| `title` | Generated per region | `"{REGION} Indie Bestsellers for {longDate}"` |
| `description` | Generated per region | Region-specific sales coverage blurb |
| `for_date` | Current Wednesday | ISO date `YYYY-MM-DD` |
| `end_date` | Saturday before `for_date` | ISO date `YYYY-MM-DD` |
| `sections[].title` | `regional_bestsellers.category` | Used as-is, no normalization |
| `entries[].isbn` | `regional_bestsellers.isbn` | |
| `entries[].title` | `regional_bestsellers.title` | |
| `entries[].author` | `regional_bestsellers.author` | |
| `entries[].publisher` | `regional_bestsellers.publisher` | Empty string if null |
| `entries[].description` | `fetch_cache` (Google Books) | Empty string if uncached |
| `entries[].blurb` | Composed | `{description}\nRank last week: {last}\nWeeks on list: {weeks_on_list}` |
| `entries[].small_image_uri` | Derived from ISBN | BookSense URL pattern |
| `entries[].large_image_uri` | Derived from ISBN | BookSense URL pattern |
| `entries[].rank` | `regional_bestsellers.rank` | Stringified: `"1"` not `1` |
| `entries[].last` | Previous week comparison | Previous rank as string, or `"NEW"` |
| `entries[].weeks_on_list` | RPC result | Stringified |

### BookSense image URL construction

Given ISBN-13 `9780593804216`:
- Last 3 digits: `216`
- Middle 3 digits (positions 7-9 from the end): `804`

URLs:
- `small_image_uri`: `https://images.booksense.com/images/books/{last3}/{mid3}/FC{isbn}.JPG`
- `large_image_uri`: `https://images.booksense.com/images/{last3}/{mid3}/{isbn}.jpg`

## Implementation Components

Pure functions (unit-testable):

- `buildBookSenseImageUrls(isbn: string): { small: string; large: string }`
- `composeBlurb(description: string, last: string, weeksOnList: string): string`
- `computeLastRank(currentIsbn: string, previousWeekBooks: RegionalBook[]): string`
- `assembleFeedJson(params): Feed`

Task phase (integration):

- New Phase 4 in `trigger/populate-regional-bestsellers.ts`, added after Phase
  3 cleanup. Iterates `successfulRegions`, calls the pure functions, uploads
  each result.

## Error Handling

- Per-region failures logged but do not abort the task. Other regions continue.
- Upload failures leave the previous week's file in place. Consumers always
  get a valid (if stale) response.
- Task return value includes `jsonFeedsGenerated: string[]` listing successful
  regions.

## Testing

**Unit tests** for each pure function using fixture data from the reference JSON.

**Manual verification** after first deploy:
1. Trigger the task from the Trigger.dev dashboard.
2. Confirm 9 files exist in the `feeds` bucket.
3. Fetch `/region/PNBA.json` through Netlify, validate JSON parses.
4. Diff field shapes against the reference (string vs number types, blurb format).
5. Load one cover image URL in a browser.

## Phase 2 Improvements (Deferred)

Documented now, not built in Phase 1:

1. **Typed fields** — `rank`/`weeks_on_list` as numbers, dates as ISO 8601.
2. **Extra fields** — `score`, `price`, `region`, `category`, `week_date` per entry.
3. **Versioned archives** — `region/{REGION}/{week}.json` preserving history.
4. **Aggregate feeds** — combined `regions.json` index with metadata; optional
   `all.json` combining every region.
5. **Improved descriptions** — investigate ABA/IndieBound data feeds.
6. **Conditional requests** — custom ETag / cache headers for efficient polling.

Phase 2 changes are additive. The Phase 1 schema remains stable at the same URLs
for backwards compatibility. New fields can be added as a superset, or a
versioned path (`/v2/region/{REGION}.json`) can serve the improved schema in
parallel.

## Rollback

If Phase 4 introduces a regression in the ingestion task, revert the commit —
the prior commit's task runs only Phases 1–3. No data migrations. The `feeds`
bucket can be left in place with stale files or manually cleared.
