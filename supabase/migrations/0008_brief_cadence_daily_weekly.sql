-- 0008_brief_cadence_daily_weekly.sql — restrict scheduled-brief cadences to daily/weekly
-- Longer cadences cannot be honestly served from live feeds: the rss proxy caps at 30 items
-- per source and Vigil stores no item history, so monthly+ would need an item archive.
begin;
update public.brief_schedules
  set cadence = 'weekly', next_run_at = now()
  where cadence in ('monthly', 'quarterly', 'annually');
alter table public.brief_schedules
  drop constraint if exists brief_schedules_cadence_check;
alter table public.brief_schedules
  add constraint brief_schedules_cadence_check check (cadence in ('daily', 'weekly'));
commit;
