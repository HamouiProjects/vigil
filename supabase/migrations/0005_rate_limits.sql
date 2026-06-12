-- 0005_rate_limits.sql — application-level rate limiting (service-role RPC only)

begin;

create table public.rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  count        integer not null default 1,
  primary key (bucket, window_start)
);

alter table public.rate_limits enable row level security;

create or replace function public.rl_increment(p_bucket text, p_window_start timestamptz, p_max integer)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  insert into public.rate_limits as rl (bucket, window_start, count)
  values (p_bucket, p_window_start, 1)
  on conflict (bucket, window_start)
  do update set count = rl.count + 1
  returning rl.count into v_count;

  return v_count <= p_max;
end;
$function$;

revoke all on table public.rate_limits from public, anon, authenticated;
revoke all on function public.rl_increment(text, timestamptz, integer) from public, anon, authenticated;

commit;
