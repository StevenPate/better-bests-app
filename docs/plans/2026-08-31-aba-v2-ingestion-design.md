# ABA IndieBound v2 Ingestion — Design

**Date:** 2026-08-31
**Status:** Validated, ready for implementation
**Supersedes:** the bookweb.org `.txt` + Google Drive scraping pipeline entirely

---

## Problem

The American Booksellers Association replaced its bestseller distribution. The
old pipeline has no source at all — this is a total break, not a degradation.

Verified 2026-08-31:

| Legacy source | Status |
|---|---|
| `bookweb.org/sites/default/files/regional_bestseller/{date}{region}.txt` | **404** for every week, current and historical |
| `bookweb.org/indiebound/bestsellers/regional` | 200, but **zero Drive links**; a stub reading "lists have moved to IndieBound.org" |

`regional_bestsellers` consequently stops at **2026-08-12**. Weeks `2026-08-19`
and `2026-08-26` are missing.

## New source

ABA now publishes at `indiebound.org`, addressable by region **and** date:

| Source | URL pattern |
|---|---|
| HTML page | `indiebound.org/bestseller-list-v2/{region}/{YYYY-MM-DD}` |
| **Google Sheet** | `abaorg.link/{region}-bestsellers-sheet-{YYYY-MM-DD}` |
| Google Doc | `abaorg.link/{region}-bestsellers-doc-{YYYY-MM-DD}` |

Region slugs: `gliba miba mpiba naiba nciba neiba pnba sciba siba national`.
`nciba`/`sciba` replace `CALIBAN`/`CALIBAS`.

### Why this is better than what it replaced

1. **Distinct file ID per week.** Every week resolves to its own Sheet ID. The
   "Drive file IDs are reused and overwritten in place" problem — the root of
   the comparison-week fallback complexity — is gone.
2. **`Last Week` and `Weeks on List` ship in the data.** No previous-week fetch
   and diff required to compute rank change.
3. **Every workbook self-identifies.** A `Report Details` tab carries the region
   name and the week date as an Excel serial (`46260` → `2026-08-26`).
4. **Archive depth.** Sheets resolve back to `2026-03-25` — 23 weeks — and are
   genuine historical captures, not redirects to the current week.

### Archive is verifiably genuine

*The Correspondent* reports `Weeks on List = 31` on `2026-04-01` and `52` on
`2026-08-26`. Those dates are 21 weeks apart; 31 + 21 = 52. The archive is
internally consistent and can be trusted as a historical record.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Source of truth | **Google Sheets** via `abaorg.link` | Already columnar; deletes the parser layer instead of rewriting it. No Cloudflare. |
| Export format | **xlsx for tab names, gviz CSV for data** | The plain CSV export returns only the first tab; the gviz endpoint serves any tab by name as clean typed CSV (string ISBNs, `$` prices) but silently returns the FIRST tab for an unknown name. So: enumerate tabs from the xlsx `workbook.xml` (detects renames), then request only confirmed names via gviz. |
| Client-side live fetch | **Delete** | Browser reads `regional_bestsellers` and generated feeds only. |
| Region codes | **Map at ingest boundary** | `nciba→CALIBAN`, `sciba→CALIBAS`. Zero migration risk to ~8k historical rows. A real migration with aliases follows later — see Deferred. |
| `Last Week` / `Weeks on List` | **Store; ABA authoritative** | Retires previous-week fetching and DB-appearance counting. |
| Cron behaviour | **Two crons: cheap polling + once-weekly recheck** | Polling ticks skip already-ingested region-weeks via `fetch_cache`; a single 17:00 PT pass force-refetches the current + 2 prior weeks. Retires the `skip if populated` guard without hammering Google every 20 minutes. |
| Backfill | **Fill gaps, audit the rest read-only** | Fills 4 weeks; audits 19 without overwriting. |

### Cloudflare note

`indiebound.org` sits behind Cloudflare — bare `curl` gets 403, browser-like
headers get 200. This is **why the HTML page is not the primary source**:
Supabase Edge and Trigger.dev egress from datacenter IPs, which Cloudflare
treats more harshly than a residential one. The `abaorg.link` → Google path has
no Cloudflare at all.

## Architecture

```
Trigger.dev cron (Wednesday, polling)
  └─ for each of 9 regions:
       resolve  abaorg.link/{slug}-bestsellers-sheet-{YYYY-MM-DD}  → Sheet ID
       persist  Sheet ID into fetch_cache          (survives shortener retirement)
       fetch    {id}/export?format=xlsx            (tab names only)
       fetch    {id}/gviz/tq?tqx=out:csv&sheet=…   (per-tab data, typed CSV)
       VALIDATE Report Details region + serial date == requested
       map      tab name → DB category, slug → DB region code
       replace  regional_bestsellers region-week (delete + insert, hash-gated)
  └─ recalculate weekly_scores for touched weeks
  └─ regenerate the 9 JSON feeds — current publication week ONLY (the bucket
     holds one feed per region; a historical recalc must never overwrite it)
```

Persistence is **replace-on-change, not merge**: when a region-week's content
hash differs from the recorded one, its rows are deleted and re-inserted. A
plain upsert would leave ghost rows when a correction shrinks a category, and
would duplicate books across category-label variants when backfilling over
rows written by the old parser. The unique index on
`(region, week_date, category, rank)` is a safety net, not the merge mechanism.

The label comes from the *request* and is then *confirmed by the file*. The
clock is never consulted. This makes the week-shift bug class structurally
impossible rather than merely fixed.

## Data model

```sql
alter table regional_bestsellers
  add column last_week_rank integer,   -- null = "New" or blank
  add column weeks_on_list  integer;
```

### Category mapping

Matching is case-insensitive and whitespace-collapsed, because ABA ships a typo
(`Childrens Series TItles`, capital I) that may be silently fixed one day.

| Sheet tab | DB category |
|---|---|
| Hardcover Fiction | `HARDCOVER FICTION` |
| Hardcover Nonfiction | `HARDCOVER NONFICTION` |
| Paperback Fiction | `TRADE PAPERBACK FICTION` |
| Paperback Nonfiction | `TRADE PAPERBACK NONFICTION` |
| Mass Market Paperback | `MASS MARKET` |
| Childrens Illustrated | `CHILDREN'S ILLUSTRATED` |
| Childrens Interest | `CHILDREN'S INTEREST` |
| Childrens Titles | `CHILDREN'S TITLES` |
| Childrens Series TItles | `CHILDREN'S SERIES TITLES` |
| Early and Middle Grade | `EARLY & MIDDLE GRADE READERS` |
| Young Adult | `YOUNG ADULT` |
| Childrens Series | **skipped** — see below |
| Report Details | validation only, not ingested |

An **unrecognized tab must fail the run loudly**. Silent skipping is how the
category drift in the 2026-08-05 / 2026-08-12 rows went unnoticed.

### The `Childrens Series` tab is skipped

Its columns are `Rank, Series, Author, Publisher` — **no ISBN, no price**. It
lists series (*Wings of Fire*, *Dog Man*), not titles. Since `isbn` is
`NOT NULL` and the application keys on ISBN throughout, ingesting it would mean
inventing synthetic ISBNs. Skipped deliberately; recorded as a possible future
feature.

Note this is distinct from `Childrens Series TItles`, which *is* title-level
with ISBNs and maps to the existing `CHILDREN'S SERIES TITLES` category.

### ISBN handling

The gviz CSV endpoint returns ISBNs as plain strings (`"9780063511637"`), so no
float decoding is needed on the data path. Rows are still validated against
`/^97[89]\d{10}$/` and dropped if they fail. The xlsx export (which stores
ISBNs as floats like `9.780063511637E12`) is used only for tab-name
enumeration — never for cell values.

## Backfill and audit

Runs as a one-shot task over the same code path as the cron.

**Fill** — 4 weeks:
- `2026-08-19`, `2026-08-26` — missing entirely
- `2026-06-03`, `2026-06-24` — currently PNBA-only (110 rows, 1 region), which
  the week-shift post-mortem recorded as permanently lost for other regions.
  They are inside the archive window and recoverable for all 9 regions.

**Audit, read-only** — the remaining 19 weeks back to `2026-03-25`. Compare
stored rank and `Weeks on List` against the archive; emit a discrepancy report.
Overwrite nothing.

`Weeks on List` increments by exactly one per week, so a mislabelled week shows
up as an off-by-N across every book at once. This is a decisive, independent
check on the manual week-shift repair — something the cache captures could not
provide.

## Deleted

`trigger/bookweb-scraper.ts`, `trigger/parseRegionalList.ts`,
`src/utils/bestsellerTextParser.ts`, `src/utils/bestsellerFetcher.ts`, the
CORS-proxy layer, and edge functions `scrape-regional-urls`,
`fetch-bestseller-file`, `fetch-regional-lists`, `fetch-previous-week`,
`fetch-pnba-lists`. Roughly 3,500 lines including tests.

## Risks

| Risk | Mitigation |
|---|---|
| `abaorg.link` is ABA-controlled and could be retired | Persist every resolved Sheet ID in `fetch_cache` at ingest |
| Backfill is ~207 requests to Google | Throttle and stagger; one-shot task, not the cron |
| Sheets are public today; sharing could be restricted | Fail loudly; HTML page remains an emergency fallback |
| ABA renames tabs or adds columns | Fail-loud mapping surfaces it instead of writing garbage |
| `weeks_on_list` jumps on cutover (23 → 434) | Expected and correct; note it in the UI methodology card |

## Preservation

Nothing before `2026-03-25` has an external source of truth ever again.

- Do **not** clear `_bestseller_list_vs_<week>_v2` cache entries — they remain
  the only record for pre-archive weeks.
- Keep `regional_bestsellers_backup_weekshift_20260805` and
  `weekly_scores_backup_weekshift_20260805` until the audit passes.

## Deferred

- **Region migration** `CALIBAN`/`CALIBAS` → `NCIBA`/`SCIBA` across 7 tables,
  the `regions` lookup, feeds and UI, with old codes kept as aliases at the
  feed boundary. Deliberately after the dust settles.
- **`Childrens Series`** series-level list as a possible new feature.
- **National list.** ABA also publishes a `national` slug with the same sheet
  structure. The app has always been regional-only, so it is deliberately not
  ingested — but the source is there if a national view is ever wanted.

## Verified assumptions

- All nine regions' `Report Details` labels follow `"{SLUG} Bestsellers"`
  exactly (checked live 2026-08-31). The ingest validation depends on this
  format and fails loudly if ABA changes it.
