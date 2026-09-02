# ABA v2 History Audit — Results

**Run:** 2026-09-01 (task `aba-audit-history`, read-only)
**Scope:** 198 region-weeks, 2026-03-25 → 2026-08-26, stored rows vs. the ABA
sheet archive, compared by (category, rank) slot.

## Headline verdicts

1. **The week-shift repair is verified correct.** A mislabeled week would show
   a near-0% match (every slot holding the adjacent week's book). No week
   does. Every old-pipeline week matches at a consistent 76–84%, with the
   shortfall fully explained by the known category-drift bug — the *labels*
   are wrong on some rows, the *weeks* are right.

2. **Everything the new pipeline wrote matches the archive at 100%**
   (2026-06-03, 06-24, 08-19, 08-26).

3. **Two previously unknown missing weeks: 2026-05-13 and 2026-05-20** —
   zero stored rows, full archive available. Backfilled 2026-09-01, together
   with a re-ingest of 08-12 (see below).

## Per-week match rates

| Week | Match | Note |
|---|---|---|
| 03-25 → 07-29 (17 wks) | 76–84% | old-parser weeks; constant ~95 MASS MARKET mismatches/week = category drift, not week shift |
| 05-13, 05-20 | — | **no stored data at all**; backfilled from archive |
| 06-03, 06-24 | 100% | backfilled from archive this session |
| 08-05 | 99.9% | 1 mismatch (GLIBA Children's Interest r10) |
| 08-12 | 97.1% | 26 mismatches, off-by-one rank shifts — ABA corrected the sheet after the old cron's ingest (exactly the class the new recheck cron catches); re-ingested |
| 08-19, 08-26 | 100% | new pipeline |

## The 80%-match structure of old-parser weeks

The matched ~80% is the four adult categories plus most children's rows; the
mismatched slots cluster almost perfectly: **95 MASS MARKET mismatches per
week, every week** — the old parser collapsed several children's lists into
MASS MARKET (and some into YOUNG ADULT), so those slots hold a different
book than the archive's true Mass Market list. This is the same defect the
partial-unique-index pre-check quantified (~4,300 colliding slots).

## Decision: repaired (2026-09-01)

The drift-week repair below was approved and executed the same day. All 16
reachable drift weeks (04-01 → 08-05) were re-ingested through the new
pipeline and rescored; the first attempt was canceled mid-run by a dev-server
connection loss and healed cleanly on re-run (hash-gated idempotency working
as designed).

**2026-03-25 special case:** ABA's first v2 workbook carries a malformed
Report Details date ("2026-46-3"), which the week-shift guard rightly
refused — this is why the audit skipped that week. Its content was verified
genuine out-of-band (weeks-on-list continuity vs. the clean 04-01 week:
every overlapping book exactly +1), then ingested with an explicit
`allowUnparseableReportDate` opt-in that keeps the region check and still
rejects any parseable-but-different date.

**End state: every week from 2026-03-25 through 2026-09-02 (24 weeks) is
new-pipeline clean** — 9 regions, ~1,220 rows/week, `last_week_rank` /
`weeks_on_list` populated, `weekly_scores` recomputed to match. Weeks before
2026-03-25 remain as-is permanently (no external source exists). Feeds were
untouched by the repair. The `*_backup_weekshift_20260805` tables are now
safe to drop whenever convenient.

## The original open decision (for the record)

The archive covers 2026-03-25 → 2026-07-29, so those 17 weeks **could** be
fully re-ingested through the new pipeline, which would:

- fix ~1,700 mislabeled slots and the ~4,300 rank-slot collisions
- populate `last_week_rank` / `weeks_on_list` across the window
- change `weekly_scores` for those weeks (categories regain true list sizes),
  which shifts year-end aggregates for 2026

Cost: rewrites ~15k rows that include the hand-verified week-shift repair
(now independently confirmed correct, so the risk is low), and the
category-composition change means scores for those weeks are computed on
clean lists while pre-archive 2026 weeks keep drifted ones.

**Not executed — awaiting a decision.** The backups
(`regional_bestsellers_backup_weekshift_20260805`,
`weekly_scores_backup_weekshift_20260805`) stay in place either way; weeks
before 2026-03-25 have no external source and are untouched regardless.

## Method caveat

The comparison is archive → stored: slots the store lacks (dedup holes,
drifted labels) lower the matched count but are only flagged when both sides
hold a different book. "100%" means every comparable slot agrees, and for
new-pipeline weeks stored ≈ archive row-for-row.

Full data: audit run `run_06g5v1or6h2sh8afis0q8o1m01` (Trigger.dev dev), raw
JSON archived in the session scratchpad.
