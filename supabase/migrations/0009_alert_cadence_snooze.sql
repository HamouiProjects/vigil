-- 0009_alert_cadence_snooze.sql
-- cadence + alert_hour are model-ready only (UI deferred to the plan move; daily is the only honest Hobby cadence).
-- snoozed_until is live now (drawer snooze control).
alter table public.alerts
  add column if not exists cadence text not null default 'daily'
    check (cadence in ('daily','15m','1h','3h')),
  add column if not exists alert_hour smallint
    check (alert_hour is null or (alert_hour >= 0 and alert_hour <= 23)),
  add column if not exists snoozed_until timestamptz;
