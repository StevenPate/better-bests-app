# ABA v2 Migration — Follow-ups

**Compiled:** 2026-09-01, at the close of the ABA IndieBound v2 ingestion
rework (design + plan in `docs/plans/2026-08-31-aba-v2-ingestion*.md`, audit
in `2026-08-31-aba-v2-audit-results.md`).

Everything here is deferred work or operational cleanup — nothing blocks the
pipeline, which is deployed and scheduled.

## Operational cleanup (cheap, do whenever)

1. **Drop the week-shift backup tables.** The audit independently confirmed
   the repair, and the drift-week re-ingest superseded those rows entirely:

   ```sql
   drop table regional_bestsellers_backup_weekshift_20260805;
   drop table weekly_scores_backup_weekshift_20260805;
   ```

2. **Undeploy the deleted edge functions from Supabase Cloud.** They are gone
   from the repo (`fe52011`) but their deployed instances still exist:

   ```
   supabase functions delete scrape-regional-urls fetch-bestseller-file \
     fetch-regional-lists fetch-previous-week fetch-pnba-lists \
     populate-regional-bestsellers
   ```

3. **Retire stale memory files** (`~/.claude` project memory):
   `project_drive_file_ids_reused` and `project_bookweb_drive_migration`
   describe the dead source; the parser-consolidation and mid-week-re-ingest
   items in `project_open_followups_2026_06` dissolved with the rework.

## Deferred product decisions

4. **Region code migration: `CALIBAN`/`CALIBAS` → `NCIBA`/`SCIBA`.**
   Decided during design: map at the ingest boundary now, migrate later with
   old codes kept as aliases at the feed/API boundary. Touches 7 tables, the
   `regions` lookup, feed titles, and ~20 frontend files.

5. **Fix D — React Router state pass-through** (pre-dates this project).
   `BestsellerTable/BookRow.tsx` → `/book/:isbn` navigation should pass
   `{title, author, publisher}` in Router state so `BookDetail` renders
   instantly. ~30 lines.

6. **A new diagnostics page, if wanted.** The old `/diagnostics` was deleted
   with the fetch layer (it administered dead machinery). A replacement would
   show `fetch_cache`'s `aba_v2_{REGION}_{WEEK}` entries (hash, sheetId,
   ingestedAt) and offer a "force re-ingest week" button that triggers
   `aba-backfill-gaps`.

7. **National list.** ABA publishes a `national` slug with the same workbook
   structure. Deliberately not ingested (the app is regional); the source is
   there if a national view is ever wanted.

8. **`Childrens Series` series-level list.** The one workbook tab not
   ingested (no ISBNs — series names only: *Dog Man*, *Wings of Fire*).
   Would need its own storage keyed on series name.

9. **Faithful multi-list storage.** The DB enforces one row per
   (region, isbn, week); a book on several category lists keeps only its
   highest-priority one (composite CHILDREN'S INTEREST last). Storing all
   memberships would need that constraint dropped plus dedup in scoring.

10. **Top-50 depth.** The workbooks carry ~50-deep lists; ingestion caps at
    the published top 15 to keep scoring comparable with history. The deeper
    data remains in ABA's sheets if a use appears (e.g. "just missed the
    list" features).

## Data caveats to remember

11. **Weeks before 2026-03-25 are old-format forever** — no external source
    exists. They lack `last_week_rank`/`weeks_on_list` and carry the old
    parser's category drift. 2026 is therefore a mixed-scoring year:
    Jan–Mar drifted, Apr–Dec clean.
12. **`weeks_on_list` is ABA's full count** (e.g. *Braiding Sweetgrass* at
    400+), not this app's tracking history. Noted in the Weeks column
    tooltip; worth a line in any public methodology copy.
13. **ABA pre-stages Wednesday's sheets on Tuesday evening**, and the data
    has verified as final. The site may show the new week up to ~12h before
    indiebound.org's page flips. If that ever matters, gate the feed
    regeneration on the page rather than the sheet.
14. **ABA workbook glitches seen so far** (each now tolerated or guarded):
    the 2026-03-25 malformed date cell, MIBA 08-19's blank Rank header, the
    `Childrens Series TItles` typo, gviz serving the wrong tab. Expect more;
    the fail-loud tab mapping is the tripwire.

## Google Books quota (structural — surfaced 2026-09-01 as "PDF not working")

The app fetches Google Books keylessly, drawing on Google's **shared
anonymous daily quota**, which exhausts unpredictably. When it does, every
uncached ISBN 429s; before the circuit-breaker fix, per-ISBN retry backoff
froze "Generate PDF" for minutes. The breaker (three consecutive 429s → fail
fast for 10 min, degrade to cached/"Unknown" genres) fixes the hang, not the
scarcity. Real fixes, either/both:

- **Add a Google Books API key** — wired 2026-09-01: the client reads
  `VITE_GOOGLE_BOOKS_API_KEY` (set in the gitignored `.env`; set it in the
  hosting provider's env too if builds run there).
- **TODO: replace the current key with a new, dedicated one.** The interim
  key is unrestricted (and was shared in plain text). In Google Cloud
  console: create a fresh key for a dedicated project, restrict it to the
  Books API and to the app's HTTP referrers (Vite bakes it into the public
  bundle, so referrer restriction is the actual protection), update `.env`
  and the hosting env, then delete the old key.
- **Pre-warm the cache server-side:** a Trigger.dev step after weekly ingest
  that fetches book info for new ISBNs into `fetch_cache`
  (`google_books_info_*`), so browsers rarely need live fetches at all. The
  ingest knows exactly which ISBNs are new each week.

## Codebase debt (pre-existing, unrelated to this project)

15. **47 TypeScript errors under `tsc --noEmit`** in `src/` (e.g.
    `BookPerformanceMetrics` snake/camel case mismatches,
    `BookChart/utils.test.ts` TimeRange). Vite builds don't typecheck, so
    they're invisible until someone runs `tsc`. Worth a cleanup pass.
16. **`package.json` trigger scripts use `@latest`** (`dev:trigger`,
    `deploy:trigger`) — resolves to 4.5.x and aborts against the pinned
    4.4.6 packages. Use `npx trigger.dev@4.4.6 …` or update the scripts.
17. **A fresh cleanup-pass audit** would be worth re-running now that the
    codebase shrank by ~7k lines — the 2026-02-28 plan's remaining items
    (unused radix deps, etc.) were largely done in March, but the ABA
    deletion changed the dependency picture again.
