-- Safety net for the ABA v2 ingest: one book per (region, week, category,
-- rank) slot. Ingestion replaces region-weeks wholesale (delete + insert,
-- hash-gated), so this index is a guard against double-writes, not an
-- ON CONFLICT merge target.
--
-- PARTIAL by design: historical rows through 2026-07-29 contain systematic
-- category-label collisions from the old parser (MASS MARKET and YOUNG ADULT
-- swallowed several children's categories, so 2-4 distinct books share a
-- rank slot). Those rows are mislabeled real data, not duplicates — deleting
-- them would destroy books. Weeks from 2026-08-01 onward are clean and
-- everything the new pipeline writes is covered.
create unique index if not exists regional_bestsellers_region_week_cat_rank_idx
  on regional_bestsellers (region, week_date, category, rank)
  where week_date >= '2026-08-01';
