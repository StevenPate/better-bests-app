-- Since the Sept 1 2026 ingest change (store every list membership), buildScores
-- sized each list by its post-dedupe row count, so lower ranks ran past list_size
-- and scored negative (#15 on a "1-book" list = -290). Near-zero totals then made
-- regional strength ratios explode, and aggregate_book_metrics has failed nightly
-- since Oct 8 (numeric overflow in rsi_variance). 2026 metrics are frozen at Oct 7.
--
-- Re-size 2026 lists to their published length (all stored rows in the category,
-- never less than the highest rank) and recompute points with the same formula.
-- Matches the buildScores fix in trigger/recalc.ts. 2024-25 deliberately untouched.
-- Changed rows' original values are kept in weekly_scores_backup_listsize_20261013.
--
-- APPLIED to production Oct 13 2026 via the Supabase MCP (9,615 rows), then
-- aggregate_book_metrics(2026) re-run successfully. Kept here for the record.

create table if not exists public.weekly_scores_backup_listsize_20261013 as
with rb as (
  select region, week_date, coalesce(category, 'General') as category,
         count(*) as n, max(rank) as max_rank
  from public.regional_bestsellers
  where week_date >= '2026-01-01'
  group by 1, 2, 3
),
ws as (
  select region, week_date, category, max(rank) as ws_max_rank
  from public.weekly_scores
  where week_date >= '2026-01-01'
  group by 1, 2, 3
)
select w.id,
       w.list_size as old_list_size,
       w.points    as old_points,
       greatest(w.list_size, ws.ws_max_rank, coalesce(rb.n, 0), coalesce(rb.max_rank, 0))::integer as new_list_size
from public.weekly_scores w
join ws using (region, week_date, category)
left join rb using (region, week_date, category)
where w.week_date >= '2026-01-01'
  and greatest(w.list_size, ws.ws_max_rank, coalesce(rb.n, 0), coalesce(rb.max_rank, 0)) <> w.list_size;

alter table public.weekly_scores_backup_listsize_20261013 enable row level security;

update public.weekly_scores w
set list_size = b.new_list_size,
    points    = round(public.calculate_weekly_score(w.rank, b.new_list_size), 4)
from public.weekly_scores_backup_listsize_20261013 b
where w.id = b.id;

-- Then refresh the frozen 2026 metrics (the nightly job does the same at 10:00 UTC):
--   select public.aggregate_book_metrics(2026);
--
-- Rollback:
--   update public.weekly_scores w
--   set list_size = b.old_list_size, points = b.old_points
--   from public.weekly_scores_backup_listsize_20261013 b where w.id = b.id;
