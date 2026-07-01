-- 0010_server_cap_enforcement.sql
-- Server-side enforcement of per-plan room and alert-rule caps (audit C2/T6).
-- These caps were client-only and so bypassable through the Supabase client.
-- A BEFORE INSERT trigger resolves the user's plan server-side and rejects
-- inserts over the cap. The brief cap is already server-enforced via
-- brief_insert_capped, so it is not duplicated here. Caps mirror
-- src/entitlements/resolve.js exactly:
--   workspaces  free 2 / pro 6  / team 12
--   alert rules free 0 / pro 10 / team 25
-- Existing rows are grandfathered (INSERT-only trigger); no data is removed.
-- Workspace saves upsert on (user_id, local_id); BEFORE INSERT also runs on the
-- update path, so cap enforcement is skipped when local_id already exists.

create or replace function public.enforce_row_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan   text;
  v_status text;
  v_cap    int;
  v_count  int;
begin
  -- Serialize concurrent inserts for the same user so count-then-insert is atomic.
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  select plan, status into v_plan, v_status
  from public.subscriptions
  where user_id = new.user_id;

  -- Any non-active subscription falls back to Free, mirroring resolveEntitlements.
  if v_status is not null and v_status not in ('active', 'trialing') then
    v_plan := 'free';
  end if;

  if tg_table_name = 'workspaces' then
    if exists (
      select 1 from public.workspaces
      where user_id = new.user_id and local_id = new.local_id
    ) then
      return new;
    end if;
    v_cap := case v_plan when 'pro' then 6 when 'team' then 12 else 2 end;
    select count(*) into v_count from public.workspaces where user_id = new.user_id;
  elsif tg_table_name = 'alerts' then
    v_cap := case v_plan when 'pro' then 10 when 'team' then 25 else 0 end;
    select count(*) into v_count from public.alerts where user_id = new.user_id;
  else
    return new;
  end if;

  if v_count >= v_cap then
    raise exception 'cap_exceeded: % limit reached for plan %', tg_table_name, coalesce(v_plan, 'free')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_row_cap() from public;
revoke all on function public.enforce_row_cap() from anon;
revoke all on function public.enforce_row_cap() from authenticated;

drop trigger if exists trg_workspaces_cap on public.workspaces;
create trigger trg_workspaces_cap
  before insert on public.workspaces
  for each row execute function public.enforce_row_cap();

drop trigger if exists trg_alerts_cap on public.alerts;
create trigger trg_alerts_cap
  before insert on public.alerts
  for each row execute function public.enforce_row_cap();
