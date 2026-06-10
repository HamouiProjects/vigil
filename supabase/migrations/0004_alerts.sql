-- 0004_alerts.sql — alert rules + matched events (Phase-2 sprint 2)

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  keyword text not null check (char_length(keyword) between 1 and 120),
  region text check (region is null or char_length(region) <= 120),
  channels text[] not null default '{in_app}',
  severity text not null default 'normal' check (severity in ('low','normal','high')),
  webhook_url text check (webhook_url is null or char_length(webhook_url) <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists alerts_user_idx on public.alerts (user_id);
create index if not exists alerts_active_idx on public.alerts (active) where active;

alter table public.alerts enable row level security;

create policy alerts_select_own on public.alerts
  as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy alerts_insert_own on public.alerts
  as permissive for insert to authenticated
  with check ((auth.uid() = user_id));

create policy alerts_update_own on public.alerts
  as permissive for update to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy alerts_delete_own on public.alerts
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  item_url text not null,
  item_title text,
  source text,
  matched_at timestamptz not null default now(),
  read_at timestamptz,
  unique (alert_id, item_url)
);

create index if not exists alert_events_user_matched_idx on public.alert_events (user_id, matched_at desc);

alter table public.alert_events enable row level security;

create policy alert_events_select_own on public.alert_events
  as permissive for select to authenticated
  using ((auth.uid() = user_id));

create policy alert_events_update_own on public.alert_events
  as permissive for update to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy alert_events_delete_own on public.alert_events
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
