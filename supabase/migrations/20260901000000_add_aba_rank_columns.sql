-- ABA IndieBound v2 supplies "Last Week" and "Weeks on List" directly.
-- Both are nullable: ABA leaves them blank for new entries and for some
-- children's categories.
alter table regional_bestsellers
  add column if not exists last_week_rank integer,
  add column if not exists weeks_on_list  integer;

comment on column regional_bestsellers.last_week_rank is
  'Rank in the previous week per ABA. NULL when the book is new to the list.';
comment on column regional_bestsellers.weeks_on_list is
  'Total weeks on list per ABA. Counts ABA history, not our DB history.';
