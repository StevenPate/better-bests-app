# Scheduled Data Fetching Pipeline

This document describes how bestseller data gets into the Better Bests system on a weekly basis. It covers the full pipeline from data source through database storage, plus development workflows and operational guidance.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Regions Reference](#regions-reference)
3. [Trigger.dev Scheduled Task](#triggerdev-scheduled-task)
4. [Database Tables](#database-tables)
5. [Development Workflow](#development-workflow)
6. [Operations and Monitoring](#operations-and-monitoring)
7. [Migration History](#migration-history)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

The Better Bests app tracks bestseller data from 9 independent regional bookselling associations across the United States. Each week, the American Booksellers Association publishes plain-text bestseller list files on [bookweb.org](https://www.bookweb.org). A scheduled Trigger.dev task fetches those files every Wednesday, parses them, and loads them into Supabase.

### Data Flow

```
bookweb.org (.txt files, published Wednesdays)
    |
    | fetch (one request per region, 500ms delay between)
    v
parseRegionalList() -- extracts rank, title, author, ISBN, publisher, price, category
    |
    | upsert (batches of 1000)
    v
regional_bestsellers (Supabase table -- raw parsed data)
    |
    | score calculation (per region, per category)
    v
weekly_scores (Supabase table -- normalized points per book per region per week)
    |
    | cleanup (delete rows older than 52 weeks from regional_bestsellers)
    v
Done (nightly cron separately aggregates weekly_scores into book_performance_metrics)
```

### Key Design Decisions

- **Sequential fetching with rate limiting**: Regions are fetched one at a time with a 500ms pause between requests to avoid overloading bookweb.org.
- **Upsert on conflict**: Both table writes use upsert rather than insert, so re-running the task for a given week is safe.
- **Score calculation is inlined**: Score calculation happens in the same task immediately after upsert, rather than as a separate HTTP call to a second function.
- **Cleanup is bounded**: Only the raw `regional_bestsellers` table is cleaned up (data older than 52 weeks). `weekly_scores` is retained indefinitely to support year-over-year comparisons.

---

## Regions Reference

| Abbreviation | File Code | Full Name |
|---|---|---|
| PNBA | pn | Pacific Northwest Booksellers Association |
| CALIBAN | nc | Northern California Independent Booksellers Association |
| CALIBAS | sc | Southern California Independent Booksellers Association |
| GLIBA | gl | Great Lakes Independent Booksellers Association |
| MPIBA | mp | Mountains & Plains Independent Booksellers Association |
| MIBA | mw | Midwest Independent Booksellers Association |
| NAIBA | na | New Atlantic Independent Booksellers Association |
| NEIBA | ne | New England Independent Booksellers Association |
| SIBA | si | Southern Independent Booksellers Alliance |

The file code determines the URL for each region's weekly file:

```
https://www.bookweb.org/sites/default/files/regional_bestseller/{YYMMDD}{file_code}.txt
```

For example, PNBA's file for the week of January 8, 2025 would be:
```
https://www.bookweb.org/sites/default/files/regional_bestseller/250108pn.txt
```

The `YYMMDD` date is always the most recent Wednesday relative to when the task runs.

---

## Trigger.dev Scheduled Task

### Location and Configuration

| Item | Value |
|---|---|
| Task file | `trigger/populate-regional-bestsellers.ts` |
| Task ID | `populate-regional-bestsellers` |
| Schedule | Wednesdays at 17:15 UTC (`cron: "15 17 * * 3"`) |
| Project ref | `proj_oqmxvnlbrekbfrcuknmw` |
| Config file | `trigger.config.ts` |
| Dashboard | https://cloud.trigger.dev/projects/v3/proj_oqmxvnlbrekbfrcuknmw |
| Max duration | 3600 seconds (1 hour) |
| Max retry attempts | 3 (exponential backoff, 1s–10s, randomized) |
| Retries in dev | Disabled |

### Phase 1: Fetch and Parse

For each of the 9 regions, the task:

1. Calculates the most recent Wednesday's date as `YYMMDD`.
2. Builds the bookweb.org URL using the region's file code.
3. Fetches the `.txt` file via HTTP GET.
4. Parses the plain-text content into structured book records.
5. Waits 500ms before fetching the next region.

**Parsing logic:** The text files follow a loosely structured format where category headers appear as all-caps lines and book entries start with a rank number followed by a period (e.g., `1. The Title`). The line immediately following each title contains comma-separated author, publisher, ISBN, and price fields.

ISBN normalization strips hyphens and spaces, then validates a 10- or 13-digit match. Books without a valid ISBN are silently skipped.

If a region's file returns a non-200 HTTP status, a warning is logged and that region is skipped — the task continues with the remaining regions.

After all regions are attempted, the collected books are upserted to `regional_bestsellers` in batches of 1,000 rows.

### Phase 2: Score Calculation

For each region that returned at least one book:

1. Query `regional_bestsellers` for all books in that region for the current week.
2. Count books per category to determine `list_size`.
3. Apply the scoring formula to each book.
4. Upsert results to `weekly_scores`.

**Scoring formula:**

```
points = 100 * (1 - log(rank) / log(list_size + 1))
```

Where:
- `rank` is the book's position on the list (1 = highest).
- `list_size` is the total number of books in that category on that region's list for that week.
- A rank-1 book on any list scores 100 points.
- A book at the bottom of the list approaches 0 points.
- `log` is the natural logarithm (`Math.log`).

Books with `rank < 1` or `list_size < 1` score 0 points.

The `category` field comes from the parsed category header in the source file (e.g., `HARDCOVER FICTION`). Books that appear before any category header are assigned the category `"General"`.

### Phase 3: Cleanup

After scoring is complete, the task deletes rows from `regional_bestsellers` where `week_date` is older than 52 weeks from the current Wednesday. This keeps the raw data table bounded in size. `weekly_scores` is not cleaned up.

### Task Return Value

On success, the task returns a JSON object:

```json
{
  "success": true,
  "weekDate": "2025-01-08",
  "regionsProcessed": ["PNBA", "CALIBAN", "CALIBAS", "GLIBA", "MPIBA", "MIBA", "NAIBA", "NEIBA", "SIBA"],
  "totalBooksFetched": 423,
  "insertedCount": 423,
  "errorCount": 0,
  "totalScoresCalculated": 423
}
```

If no books are fetched from any region, the task returns `{ "success": false, "reason": "no_books_fetched" }` and stops early — no database writes occur.

### Required Environment Variables

These must be set in the Trigger.dev cloud dashboard under the project's Environment Variables settings:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (bypasses Row Level Security) |

For local development, also add to your `.env` file:

| Variable | Description |
|---|---|
| `TRIGGER_SECRET_KEY` | Your Trigger.dev secret key (from the dashboard) |

---

## Database Tables

### `regional_bestsellers`

Stores the raw parsed content of each week's bestseller files. This is the intermediate staging table — it feeds score calculation and is cleaned up after 52 weeks.

| Column | Type | Description |
|---|---|---|
| `region` | text | Region abbreviation (e.g., `PNBA`) |
| `isbn` | text | Normalized ISBN (10 or 13 digits, no hyphens) |
| `title` | text | Book title as it appears in the source file |
| `author` | text | Author name |
| `publisher` | text (nullable) | Publisher name |
| `rank` | integer | Rank position on the list |
| `category` | text (nullable) | Category header (e.g., `HARDCOVER FICTION`) |
| `week_date` | date | Wednesday of the week this data covers (ISO 8601) |
| `list_title` | text (nullable) | Formatted list name (e.g., `PNBA Independent Bestsellers`) |
| `price` | text (nullable) | Price as parsed from the source file (e.g., `$19.99`) |

Unique constraint: `(region, isbn, week_date)`

### `weekly_scores`

Stores the calculated score for each book-region-week combination. This is the primary table queried by the app for rankings and analytics.

| Column | Type | Description |
|---|---|---|
| `isbn` | text | ISBN |
| `region` | text | Region abbreviation |
| `week_date` | date | Wednesday of the scoring week |
| `rank` | integer | Rank position on the list |
| `category` | text | Category (defaults to `"General"` if none in source) |
| `list_size` | integer | Number of books in this category this week for this region |
| `points` | numeric | Calculated score (0–100) |

Unique constraint: `(isbn, region, week_date, category)`

### Downstream Tables (Not Part of This Pipeline)

These tables are populated by a separate nightly cron (`aggregate_book_metrics` RPC) that reads from `weekly_scores`. They are not written to by the Trigger.dev task.

| Table | Description |
|---|---|
| `book_performance_metrics` | Yearly aggregates per ISBN |
| `book_regional_performance` | Yearly aggregates per ISBN per region |

**Important:** Because `book_performance_metrics` is populated nightly, metrics for the current week may not appear until the following day. Always code defensively and fall back to `weekly_scores` for same-day data needs.

---

## Development Workflow

### Starting the Trigger.dev Dev Server

```bash
npm run dev:trigger
```

This starts the Trigger.dev CLI in dev mode, which connects your local task code to the Trigger.dev cloud. Scheduled tasks will not fire automatically in dev mode — you trigger them manually from the dashboard or via the MCP tool.

The `TRIGGER_SECRET_KEY` environment variable must be set in `.env` before running this command.

### Deploying to Production

```bash
npm run deploy:trigger
```

This deploys the task in `trigger/` to Trigger.dev cloud. The scheduled cron will run automatically in the cloud environment from that point forward.

### Manually Triggering the Task

**From the dashboard:** Navigate to https://cloud.trigger.dev/projects/v3/proj_oqmxvnlbrekbfrcuknmw, find the `populate-regional-bestsellers` task, and use the "Trigger" button.

**Via MCP tools in Claude Code:** Use the `trigger_task` MCP tool with `taskId: "populate-regional-bestsellers"`.

### Checking Task Code

The task is the single file `trigger/populate-regional-bestsellers.ts`. The `trigger.config.ts` at the project root configures the project reference, retry behavior, and task directory.

---

## Operations and Monitoring

### Trigger.dev Dashboard

The dashboard at https://cloud.trigger.dev/projects/v3/proj_oqmxvnlbrekbfrcuknmw provides:

- **Run history**: Every past execution with status (completed, failed, etc.)
- **Structured logs**: The task uses `logger.info`, `logger.warn`, and `logger.error` throughout, making it easy to trace exactly which region failed and why
- **Retry tracking**: Shows whether a run succeeded on the first attempt or required retries
- **Manual trigger**: Run the task on demand without waiting for the Wednesday schedule

### Retry Behavior

The task is configured with up to 3 attempts per scheduled run. Backoff is exponential starting at 1 second, capped at 10 seconds, with randomization to spread retries. Retries are disabled in local dev mode.

Note that retries restart the entire task from Phase 1. Because all writes are upserts, reprocessing a week is safe — no duplicate data is created.

### Normal Weekly Run Timeline

- **Wednesday morning (bookweb.org time)**: New `.txt` files are published.
- **Wednesday 17:15 UTC**: Trigger.dev fires the scheduled task.
- **~5–15 minutes later**: Task completes, `weekly_scores` is updated.
- **Nightly (following night)**: `aggregate_book_metrics` RPC runs, updating `book_performance_metrics` and `book_regional_performance`.

---

## Migration History

The weekly data pipeline was originally built as two Supabase Edge Functions triggered by pg_cron:

1. `supabase/functions/populate-regional-bestsellers/index.ts` — fetched and parsed the bookweb.org files.
2. `supabase/functions/calculate-weekly-scores/index.ts` — called via HTTP from the first function to calculate scores.

Starting in December 2025, the `populate-regional-bestsellers` Edge Function began consistently timing out every week. The Supabase dashboard showed runs stuck in "running" status that never completed. Score calculation stopped running as a result.

In February 2026, the pipeline was migrated to Trigger.dev:

- The two Edge Function responsibilities were combined into a single `trigger/populate-regional-bestsellers.ts` task with a 1-hour maximum duration.
- Score calculation was inlined into the same task rather than remaining a separate HTTP-triggered function.
- pg_cron jobs were removed via migration `supabase/migrations/20260218100000_remove_regional_cron_jobs.sql`, which unscheduled both `populate-regional-bestsellers-weekly` and `populate-regional-bestsellers-retry`.

### Current State of Old Edge Functions

The old Edge Functions still exist in `supabase/functions/` but are no longer invoked by any cron or scheduled mechanism:

- `supabase/functions/populate-regional-bestsellers/` — inactive, superseded by Trigger.dev task
- `supabase/functions/calculate-weekly-scores/` — inactive, logic inlined into Trigger.dev task

There is also a `supabase/functions/fetch-pnba-lists/` Edge Function that handles PNBA specifically. This function is separate from the weekly pipeline and remains active.

---

## Troubleshooting

### Task runs but reports zero books fetched

**Likely cause:** The bookweb.org files for this Wednesday have not been published yet. Files are typically available Wednesday morning US time. The task runs at 17:15 UTC (approximately 9–10am Pacific), but publishing times can vary.

**What to check:**
- Manually fetch one region's URL to see if the file exists: `https://www.bookweb.org/sites/default/files/regional_bestseller/YYMMDD{code}.txt` (replace `YYMMDD` with the current Wednesday's date in that format).
- If the file is not found (404 or non-200), wait and re-trigger the task later in the day.
- The task returns `{ "success": false, "reason": "no_books_fetched" }` and does not write anything to the database in this case.

### Task fails with Supabase connection errors

**Likely cause:** `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing or incorrect in the Trigger.dev dashboard environment variables.

**What to check:**
- Navigate to the Trigger.dev dashboard > Project Settings > Environment Variables.
- Verify both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present and match your Supabase project.
- Use the service role key, not the anon key — the service role key is required to bypass Row Level Security for upsert operations.

### Some regions succeed but others fail

**Likely cause:** One or more regional files were unavailable at the time of the fetch (non-200 HTTP response), or the file format differed from what the parser expects.

**What to check:**
- Check the Trigger.dev run logs for `warn` entries indicating which region failed and what HTTP status was returned.
- The task continues processing successful regions even when some fail, so you will have partial data for that week.
- You can re-run the task manually after confirming the missing files are available; the upsert-on-conflict strategy means already-inserted rows will be updated rather than duplicated.

### Score calculation produced no results for a region

**Likely cause:** Phase 1 succeeded in upserting books, but the subsequent query in Phase 2 returned no rows. This could happen if the upsert failed silently or if the `week_date` used in the query did not match the stored rows.

**What to check:**
- Check the Trigger.dev logs for `error` entries during the scoring phase.
- Query `regional_bestsellers` directly in the Supabase dashboard, filtering by the expected `week_date`, to confirm whether data was actually written.

### Local dev: task won't start

**Likely cause:** `TRIGGER_SECRET_KEY` is not set in `.env`.

**What to check:**
- Confirm `.env` contains `TRIGGER_SECRET_KEY=your_secret_key_here`.
- Obtain the secret key from the Trigger.dev dashboard under Project Settings > API Keys.
- Run `npm run dev:trigger` again after updating `.env`.

### `book_performance_metrics` not showing new data after the task runs

**Expected behavior, not a bug.** The `book_performance_metrics` and `book_regional_performance` tables are populated by the separate `aggregate_book_metrics` nightly RPC, not by the Trigger.dev task. New data appears in those tables after the next nightly aggregation run. The `weekly_scores` table will have current-week data immediately after the Trigger.dev task completes.
