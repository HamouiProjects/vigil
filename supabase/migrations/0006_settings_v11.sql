-- 0006_settings_v11.sql — settings v1.1: email_signups dedupe, atomic brief cap, anon signup policy removal

begin;

-- (a) dedupe email_signups: keep earliest row per lower(email)
delete from public.email_signups a
where exists (
  select 1
  from public.email_signups b
  where lower(b.email) = lower(a.email)
    and b.created_at < a.created_at
);

-- (b) unique index on lower(email)
create unique index if not exists email_signups_email_lower_uidx
  on public.email_signups (lower(email));

-- (c) atomic brief insert with monthly cap
create or replace function public.brief_insert_capped(
  p_user uuid,
  p_workspace uuid,
  p_content jsonb,
  p_period text,
  p_cap int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count int;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select count(*)::int into v_count
  from public.briefs
  where user_id = p_user
    and created_at >= date_trunc('month', now());

  if v_count >= p_cap then
    return null;
  end if;

  insert into public.briefs (user_id, workspace_id, content, period)
  values (p_user, p_workspace, p_content, p_period)
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.brief_insert_capped(uuid, uuid, jsonb, text, int) from public;
revoke all on function public.brief_insert_capped(uuid, uuid, jsonb, text, int) from anon;
revoke all on function public.brief_insert_capped(uuid, uuid, jsonb, text, int) from authenticated;

-- (d) remove client-side anon insert path for email signups
drop policy if exists email_signups_insert_any on public.email_signups;

commit;
