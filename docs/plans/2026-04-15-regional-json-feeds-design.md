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

## Last-Rank Matching

### Data constraint

The `regional_bestsellers` table has a `UNIQUE(region, isbn, week_date)`
constraint (see `20251105000000_create_regional_bestsellers.sql`). This
guarantees **at most one row per ISBN per region per week**. No deduplication
step is needed in Phase 4 code.

### Matching rule

For each book on the current week's list:

1. Look up the same `isbn` in the region's previous-week query result.
2. If found, `last = String(previousRow.rank)`.
3. If not found, `last = "NEW"`.

Matching is **by ISBN only, ignoring category**. A book that was in
`HARDCOVER FICTION` last week and `PAPERBACK FICTION` this week (category
moves are rare but possible) uses its prior rank, not `"NEW"`. This matches
how the reference feed appears to behave.

### Test case (added to fixtures)

```ts
it('uses ISBN-only match, ignoring category', () => {
  const previous = [
    { isbn: '9780000000001', category: 'HARDCOVER FICTION', rank: 3 }
  ];
  const current = { isbn: '9780000000001', category: 'PAPERBACK FICTION', rank: 2 };

  expect(computeLastRank(current.isbn, previous)).toBe('3');
});

it('returns NEW when ISBN absent from previous week', () => {
  const previous = [
    { isbn: '9780000000001', category: 'FICTION', rank: 3 }
  ];
  expect(computeLastRank('9780000000002', previous)).toBe('NEW');
});
```

### Phase 2 option

If stakeholders want `last` scoped per-category (so a book's appearance in a
new category shows as `NEW`), Phase 2 could change the matching rule to
`(isbn, category)` instead of `isbn`. This is a schema-compatible change that
doesn't affect the feed structure.

## Phase 4 Timing and Retry Behavior

### Is Phase 4 part of the same task?

**Yes.** Phase 4 runs inside the existing `populateRegionalBestsellers`
Trigger.dev task, after Phase 3 cleanup. No separate trigger.

### Time budget estimate

Per task run (9 regions):

- 9 previous-week queries (one per region, indexed lookup): ~100ms each → 1s
- 9 RPC calls (`get_weeks_on_list_batch_regional`): ~200ms each → ~2s
- 9 `fetch_cache` batched queries (one per region, `.in()` on cache_key): ~300ms each → ~3s
- Pure-function JSON assembly: <100ms total
- 9 Storage uploads (50–200 KB each): ~500ms each → ~5s

**Estimated total Phase 4 duration: ~15 seconds** under normal conditions.
Worst-case with network retries on Storage: ~60 seconds.

### maxDuration adequacy

Current `trigger.config.ts` has `maxDuration: 3600` (1 hour). Phase 4 adds
~60 seconds worst-case on top of existing Phases 1–3 (which already complete
comfortably within the limit). **No config change needed.**

### Failure modes for Phase 4

| Failure mode | Behavior | Consumer impact |
|---|---|---|
| Single region query/upload fails | Logged, other regions continue. Previous week's file stays in Storage. | Consumer of that region gets stale (last week's) data. |
| All regions fail (e.g., bucket missing) | Task throws at end → Trigger.dev retries whole task. | All consumers get stale data until retry succeeds. |
| Phase 4 times out mid-run | Trigger.dev marks task failed, retries task. Phases 1–3 early-exit on retry (ingestion check skips re-processing). | Some regions have fresh feeds, others stale, until retry completes Phase 4. |

### Retry semantics

Because the task retries as a unit, Phase 4 retries automatically when the
whole task retries. The existing early-exit check (added in commit
`6e57703`) means Phases 1–3 are near-no-ops on retry: they detect that
ingestion already populated `regional_bestsellers` for the current week and
skip directly to logging. Phase 4 then runs freshly.

**Consequence:** A transient Phase 4 failure that triggers a task retry
costs only Phase 4's ~15 seconds on the retry, not the full ingestion
pipeline.

### Explicit non-goal: per-region retry

Phase 1 does not implement per-region retry within a single task run. If
region CALIBAS fails in the first pass, it is not re-attempted before the
task completes. Operators rely on:

1. The previous week's file remaining valid in Storage (no user-visible
   outage).
2. Manual task re-trigger via the Trigger.dev dashboard if needed.
3. The next weekly run naturally overwriting the stale file.

Phase 2 splits feed generation into a separate task with per-region subtasks
(`triggerAndWait` on each region) so individual regions can retry
independently with distinct retry configs.

## Description Sanitization and Blurb Format

### JSON escaping vs. content sanitization

These are separate concerns:

- **JSON escaping** (quotes → `\"`, newlines → `\n`, control chars → `\uXXXX`)
  happens automatically in `JSON.stringify`. Any conformant JSON parser reverses
  it. This is **not our concern** — we do not hand-escape anything.
- **Content sanitization** normalizes the text itself before it enters the
  feed. This **is our concern** and is specified below.

### Reference-feed characteristics (verified)

Measured against `bestsellers.json` (100 entries):

- Description length: avg 110 chars, max 343 chars
- Quotes in description: 2% (handled by JSON.stringify)
- Embedded newlines in description: 2%
- HTML tags in description: 0% (reference feed strips HTML)

Google Books descriptions can be longer (500–1000+ chars), and they sometimes
include HTML tags (`<p>`, `<i>`, `<br>`) that the reference feed does not.

### Sanitization rules

Applied in `sanitizeDescription(raw: string): string`:

1. Strip HTML tags via simple regex: `raw.replace(/<[^>]*>/g, '')`.
2. Decode common HTML entities (`&amp;`, `&quot;`, `&#39;`, `&mdash;`, `&nbsp;`).
3. Collapse internal whitespace runs: `/\s+/g → ' '` (preserves single spaces,
   removes stray tabs, multiple spaces, and accidental newlines from HTML).
4. Trim leading/trailing whitespace.
5. Cap length at 500 characters. If truncation occurs, break at the last word
   boundary before the limit and append `'…'` (U+2026).
6. If the result is empty after sanitization, return empty string.

### Blurb composition

`composeBlurb(sanitizedDescription, last, weeksOnList)` returns:

```
{sanitizedDescription}\nRank last week: {last}\nWeeks on list: {weeksOnList}
```

The `\n` characters are literal newlines in the JavaScript string. `JSON.stringify`
emits them as `\n` escape sequences in the serialized JSON. Consumers that
`JSON.parse` the feed get back real newlines. This matches the reference feed
byte-for-byte.

**Note:** How consumers render `\n` (as `<br>`, as space, as literal newline)
is the consumer's concern, not the feed's. The reference feed makes the same
trade-off.

### Unit test fixtures

`sanitizeDescription` tests must cover:

| Input | Expected output |
|---|---|
| `""` | `""` |
| `"plain text"` | `"plain text"` |
| `"he said \"hi\""` | `"he said \"hi\""` (unchanged; JSON.stringify escapes) |
| `"line 1\nline 2"` | `"line 1 line 2"` (newlines collapse to space) |
| `"<p>para</p>"` | `"para"` |
| `"bold <b>word</b> here"` | `"bold word here"` |
| `"Smith &amp; Jones"` | `"Smith & Jones"` |
| `"  padded  "` | `"padded"` |
| `"a".repeat(600)` | `"aaa…aaa…"` length ≤ 500 |
| `"word ".repeat(200)` | truncated at a word boundary + `…` |

`composeBlurb` tests must cover:

- Empty description: `composeBlurb("", "NEW", "1")` → `"\nRank last week: NEW\nWeeks on list: 1"`
- Normal case: verify exact newline placement
- Long description: verify the sanitization already happened upstream (blurb
  itself does no truncation)

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

## Error Handling and Task Result Contract

### Per-region outcome taxonomy

Each region in Phase 4 ends in exactly one of these states:

| Outcome | Meaning | Retriable? |
|---|---|---|
| `success` | Feed generated and uploaded | N/A |
| `skipped` | Region wasn't in `successfulRegions` from Phase 1 (ingestion failed upstream) | No — upstream fix needed |
| `no_books` | Region has no books for the current week in `regional_bestsellers` | No — data issue |
| `transient_error` | Network timeout, Storage 5xx, RPC timeout | Yes — safe to re-run just Phase 4 |
| `permanent_error` | Validation failure, schema mismatch, malformed data | No — needs code fix |

### Task return value

Phase 4 adds a `feedGeneration` key to the existing task result:

```ts
{
  success: true,              // Task-level, existing field
  weekDate: "2026-04-15",
  regionsProcessed: [...],    // Existing
  insertedCount: 900,         // Existing
  totalScoresCalculated: 900, // Existing
  feedGeneration: {
    succeeded: ["PNBA", "CALIBAN", "GLIBA", ...],
    skipped: [
      { region: "MIBA", reason: "upstream_ingestion_failed" }
    ],
    failed: [
      {
        region: "CALIBAS",
        outcome: "transient_error",
        error: "Storage upload failed: 503",
        retriable: true
      }
    ]
  }
}
```

### Task-level success policy

- **All regions `success` or `skipped`:** task returns success.
- **Any region in `failed`:** task still returns success at the Trigger.dev
  level, but each failure is logged via `logger.error` with structured
  metadata. The ingestion and scoring work from Phases 1–3 is already
  committed to the DB and should not be re-run.
- **All regions failed:** throw at end of task so Trigger.dev's retry logic
  engages. This indicates a systemic failure (e.g., Storage bucket missing,
  bad credentials) that a retry might clear.

### Alerting strategy

Trigger.dev captures `logger.error` calls in task runs. For each failed
region:

```ts
logger.error("Regional feed generation failed", {
  region: "CALIBAS",
  outcome: "transient_error",
  error: errorMessage,
  retriable: true,
  weekDate: weekDateISO,
});
```

Operators monitoring the Trigger.dev dashboard see failures per run. For
production alerting, a downstream webhook on task completion can parse
`feedGeneration.failed` and notify (Slack, PagerDuty) — but wiring that up is
out of scope for Phase 1.

### Retry approach

Phase 1 does not auto-retry failed regions mid-task. If a transient failure
occurs:

1. Feed generation code continues to the next region.
2. The previous week's file remains in Storage — consumers get stale but
   valid data.
3. An operator can manually re-trigger the task, which skips already-ingested
   regions (via the existing early-exit check) but will regenerate feeds for
   all `successfulRegions`.

**Phase 2 option:** Split Phase 4 into a separate `generate-regional-feeds`
task that triggers after ingestion completes. Individual regions become
subtasks that can retry independently via `triggerAndWait` with per-region
retry config.

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
