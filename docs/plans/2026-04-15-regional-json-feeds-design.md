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
  `_redirects` rule with status `200` (rewrite, not redirect). See "Netlify
  Proxy Trade-offs" below.
- **CORS:** Supabase public buckets serve with permissive CORS by default.
- **Cache:** On upload, set `cacheControl: '604800'` (7 days) via the Supabase
  upload options. Files don't change until the next Wednesday run, so a longer
  TTL reduces CDN bandwidth without serving stale data. See "Cache Strategy"
  below.

### Cache Strategy

Default Supabase Storage cache is `max-age=3600` (1 hour). Between Wednesday
updates that's 168 cache windows serving identical bytes — wasteful.

**Phase 1:** Upload with `cacheControl: '604800'` (7 days). Weekly updates
overwrite the file; the new upload invalidates the prior cache entry at the
CDN edge via Supabase's internal cache-busting on mutation. Clients fetching
during the brief propagation window may see the prior week's data, which is
acceptable.

**Phase 2 additions:**

1. ETag / Last-Modified support with conditional `304 Not Modified` responses.
   Supabase Storage exposes ETags automatically; the main work is ensuring the
   Netlify proxy doesn't strip them.
2. Purge CDN on upload via Supabase's cache invalidation API if content
   propagation becomes a problem.

### Netlify Proxy Trade-offs

We use a **200 rewrite** rather than a **307 redirect**. Trade-offs:

| Concern | 200 Rewrite | 307 Redirect |
|---|---|---|
| Client sees origin | Hidden (Netlify) | Exposed (Supabase) |
| Round trips | 1 | 2 |
| Debuggability on 5xx | Harder (masked origin) | Easier (direct error) |
| CORS headers | Supabase's | Supabase's |
| Public API stability | High (URL permanent) | High (URL permanent) |

**Decision:** 200 rewrite. The latency win matters for the SPA's internal
use; third-party consumers get a single URL that doesn't change even if we
later swap out the storage backend. The debuggability cost is mitigated by
documenting the Supabase origin in the public API docs so consumers know
where to look when investigating 5xx errors.

**Supabase unavailable fallback:** None in Phase 1. If Supabase Storage is
down, consumers get a 5xx response. Phase 2 could add a Netlify Edge Function
that caches the last successful response in KV storage and serves it as a
fallback.

### Case Sensitivity

Netlify path matching is case-sensitive. Our generated files are uppercase
(`region/PNBA.json`) to match the `REGIONS` constant.

**Phase 1 behavior:** `/region/PNBA.json` → file found.
`/region/pnba.json` → 404.

**Decision:** Document uppercase-only in the public API, matching REST
conventions. Most public JSON feeds (GitHub, Reddit, etc.) treat paths as
case-sensitive. Add both cases to the manual verification checklist to confirm
the expected behavior.

**Phase 2 option:** Add a second `_redirects` rule mapping lowercase region
codes to the uppercase URL, or use a Netlify Edge Function to normalize case
before fetching.

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

**Source of the pattern:** Reverse-engineered from the reference
`bestsellers.json`. BookSense has no public API documentation for their image
CDN. The pattern was verified against multiple sample ISBNs from the reference
feed:

| ISBN | last3 | mid3 | small URL | large URL |
|---|---|---|---|---|
| 9780593804216 | 216 | 804 | .../books/216/804/FC9780593804216.JPG | .../216/804/9780593804216.jpg |
| 9781682816752 | 752 | 816 | .../books/752/816/FC9781682816752.JPG | .../752/816/9781682816752.jpg |
| 9781984881991 | 991 | 881 | .../books/991/881/FC9781984881991.JPG | .../991/881/9781984881991.jpg |

**Risk:** If BookSense changes their URL scheme, all generated URLs break
simultaneously. Mitigation documented in "Image URL Failure Handling" below.

**Extraction rule:**

- `last3` = last 3 digits of the ISBN-13
- `mid3` = digits 7–9 counting from the left (or digits 4–6 from the right)

**URL templates:**

- `small_image_uri`: `https://images.booksense.com/images/books/{last3}/{mid3}/FC{isbn}.JPG`
- `large_image_uri`: `https://images.booksense.com/images/{last3}/{mid3}/{isbn}.jpg`

**Validation contract for `buildBookSenseImageUrls(isbn)`:**

- Throw `Error` if `isbn` is not exactly 13 characters after stripping any
  hyphens/whitespace.
- Throw `Error` if `isbn` contains any non-digit characters after normalization.
- The function is pure — no network calls, no side effects.
- Callers in the task phase catch thrown errors per book and omit the entry
  from the feed rather than aborting the whole region.

### Image URL Failure Handling

At generation time we do **not** HEAD-check each URL. Per region this would be
~200 HTTP requests (small + large per book), and most would be redundant with
prior runs.

**Runtime detection (Phase 1):** Accept that generated URLs are deterministic
from the reverse-engineered pattern. If BookSense's scheme changes, all feeds
break together and we'll notice from monitoring or user reports.

**Phase 2 additions:**

1. A nightly audit job HEAD-checks a random sample of 50 generated URLs per
   week and alerts if >10% 404.
2. Track known-missing ISBNs in a new `booksense_image_blacklist` table. At
   generation time, books in the blacklist get empty `small_image_uri` /
   `large_image_uri` strings rather than broken URLs.
3. A client-side `onError` handler on the SPA reports 404s back to the API,
   which populates the blacklist.

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

## Query Cardinality and Batching

Each region has roughly 100 books (8–10 categories × 10–15 books). The
implementation must avoid per-book queries.

**Per region — four batched queries total:**

1. Current week books: reused from Phase 2's scoring query. No new query.
2. Previous week books: one `select` on `regional_bestsellers` filtered by
   `week_date = previousWednesday` and `region`.
3. Weeks on list: one `get_weeks_on_list_batch_regional` RPC call. The RPC is
   server-side batched — `WHERE rb.isbn = ANY(isbn_list)` with `GROUP BY`, no
   client-side filtering.
4. Descriptions: one `fetch_cache` query using `.in('cache_key', keys)`. Missing
   ISBNs simply don't appear in results; their `description` becomes empty
   string. No wasted work pre-filtering.

**Batch size cap:** `fetch_cache` and RPC queries are chunked at **100 ISBNs per
chunk**. Typical regions fit in one chunk; the cap protects against Postgres
`IN`-clause bloat if a region's list ever grows.

**Total per task run (9 regions):** ~36 queries + 9 Storage uploads.

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
4. Fetch `/region/pnba.json` (lowercase) — confirm 404 matches the documented
   case-sensitive behavior.
5. Inspect response headers for `cache-control: max-age=604800`.
6. Diff field shapes against the reference (string vs number types, blurb format).
7. Load one cover image URL in a browser.

## Phase 2 Improvements (Deferred)

Documented now, not built in Phase 1:

1. **Typed fields** — `rank`/`weeks_on_list` as numbers, dates as ISO 8601.
2. **Extra fields** — `score`, `price`, `region`, `category`, `week_date` per entry.
3. **Versioned archives** — `region/{REGION}/{week}.json` preserving history.
4. **Aggregate feeds** — combined `regions.json` index with metadata; optional
   `all.json` combining every region.
5. **Improved descriptions** — investigate ABA/IndieBound data feeds.
6. **Conditional requests** — custom ETag / cache headers for efficient polling.
7. **Image URL auditing** — nightly HEAD-check sample + blacklist table + SPA
   `onError` reporting loop to replace 404ing BookSense URLs with empty
   strings. See "Image URL Failure Handling" above.

Phase 2 changes are additive. The Phase 1 schema remains stable at the same URLs
for backwards compatibility. New fields can be added as a superset, or a
versioned path (`/v2/region/{REGION}.json`) can serve the improved schema in
parallel.

## Rollback

If Phase 4 introduces a regression in the ingestion task, revert the commit —
the prior commit's task runs only Phases 1–3. No data migrations. The `feeds`
bucket can be left in place with stale files or manually cleared.
