# Drive File Snapshot for Cross-Week Comparison — Design

**Status:** Design draft, not scheduled
**Date:** 2026-07-02

## Problem

bookweb.org publishes each week's regional bestseller lists via Google Drive
URLs (scraped from `https://www.bookweb.org/indiebound/bestsellers/regional`).
The list owner reuses the same Drive file IDs every week — content is
overwritten in place rather than uploaded as new files. This was verified on
2026-07-02: `drive_urls_2026-06-24` and `drive_urls_2026-07-01` cache rows have
byte-identical URLs for every region.

Consequence: once the new Wednesday list publishes, the previous week's data
is unrecoverable from Drive. Fetching last week's cached URL now returns this
week's content, so `compareLists` sees identical current + previous inputs and
produces zero adds, drops, or rank changes.

The immediate patch (2026-07-02) reads the previous week from
`regional_bestsellers` when the previous Drive URL is missing or identical to
the current one. That works because the Wednesday cron
(`trigger/populate-regional-bestsellers.ts`) persists the raw ranks and books
into `regional_bestsellers` on the day of publication.

## Limitation of the immediate patch

The DB fallback recovers **parsed** data. If the parser had a bug when a given
week was ingested (as with the pre-`7945d70` PNBA 2026-06-24 rows —
CHILDREN'S ILLUSTRATED and EARLY & MIDDLE GRADE READERS books were swallowed
into MASS MARKET), the DB has already-broken categories and no way to reparse.
The raw source text is gone from Drive by then.

## Goal

Snapshot each week's raw Drive file contents at ingestion time so future
parser fixes can be reapplied to historical weeks and the previous-week
comparison never depends on Drive URL stability.

## Approach

Extend `trigger/populate-regional-bestsellers.ts` (or the shared
`bookweb-scraper` module) so that when it fetches a region's Drive file for
ingestion, it also writes the raw text to `fetch_cache` under a new key:

```
regional_list_text_<region>_<yyyy-mm-dd>
```

where the date is the Wednesday publication date. Body shape:

```json
{
  "region": "PNBA",
  "weekDate": "2026-06-24",
  "sourceUrl": "https://drive.usercontent.google.com/download?id=...",
  "fetchedAt": "2026-06-24T15:03:21Z",
  "contents": "<raw file bytes as UTF-8 text>"
}
```

Then update `BestsellerParser.buildPreviousListFromDb` (or introduce a
sibling `buildPreviousListFromSnapshot`) so the client's previous-week
fallback prefers the raw-text snapshot when present, falling back to
`regional_bestsellers` rows only when no snapshot exists.

## Open questions

1. **Storage cost.** A single week's regional file is ~5–15 KB, × 9 regions ×
   52 weeks/year ≈ 5 MB/year. Trivial. Retain indefinitely.
2. **Migration for existing weeks.** We can't recover pre-existing weeks' raw
   text — Drive already overwrote them. New weeks going forward are covered.
3. **Where to put the write.** Options:
   - Inside `bookweb-scraper.ts` alongside `cacheDriveUrls` — runs whenever the
     scrape edge function fires. Consistent, but redundant if the file gets
     re-fetched by the ingestion cron seconds later.
   - Inside `populate-regional-bestsellers.ts` Phase 1, right after
     `fetch(driveUrl).text()` — writes exactly what's about to be parsed.
     Preferred.
4. **Reparsing on parser fix.** Ship a small admin action or one-off script
   that iterates snapshots and re-populates `regional_bestsellers` with fresh
   parses. Not required for MVP.

## Non-goals

- Recovering the pre-2026-07-02 backlog. The raw source is gone.
- Serving snapshots as a public API. Internal use only.

## Related

- `src/utils/bestsellerFetcher.ts:buildPreviousListFromDb` — immediate patch,
  parses from `regional_bestsellers` rows.
- `trigger/populate-regional-bestsellers.ts` — where the snapshot write would
  slot in.
- `trigger/bookweb-scraper.ts:cacheDriveUrls` — analogous pattern (URLs only,
  not contents).
