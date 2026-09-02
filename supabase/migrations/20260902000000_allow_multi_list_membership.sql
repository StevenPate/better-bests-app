-- ABA lists the same book on several category lists simultaneously (e.g.
-- Rowley Jefferson: Early & Middle Grade #1, Children's Titles #3, Children's
-- Interest #1; or hardcover/paperback editions on their own lists). The old
-- pipeline's one-row-per-book model forced a dedup that left official lists
-- displaying incomplete (EMG showed 13 of 15 entries).
--
-- Storage now keeps every list membership. Scoring dedupes instead
-- (trigger/recalc.ts buildScores credits each book once, in its most
-- specific list), so weekly_scores semantics are unchanged.
alter table regional_bestsellers
  drop constraint if exists regional_bestsellers_region_isbn_week_unique;

-- The per-slot uniqueness guard (region, week_date, category, rank) from
-- 20260901000100 remains — that one is real: two books can never share a
-- rank slot on the same list.
