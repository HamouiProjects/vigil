-- v1 schema migration (run in Supabase SQL editor)

alter table public.workspaces add column if not exists local_id   text;
alter table public.workspaces add column if not exists created_at  timestamptz not null default now();

do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='workspaces' and column_name='layout_json') then
    alter table public.workspaces rename column layout_json to layout;
  end if;
end $$;

alter table public.workspaces
  add column if not exists widgets     jsonb not null default '[]'::jsonb,
  add column if not exists settings    jsonb not null default '{}'::jsonb,
  add column if not exists position    int   not null default 0,
  add column if not exists share_token text unique;

create unique index if not exists workspaces_user_local_uidx
  on public.workspaces (user_id, local_id);

drop policy if exists "Users own workspaces" on public.workspaces;
drop policy if exists "own workspaces"        on public.workspaces;
create policy "own workspaces" on public.workspaces
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null, identifier text not null, label text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free', add_ons text[] not null default '{}',
  team_id uuid, status text not null default 'active',
  updated_at timestamptz not null default now()
);

alter table public.sources       enable row level security;
alter table public.subscriptions enable row level security;

drop policy if exists "own sources" on public.sources;
create policy "own sources" on public.sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own subscription" on public.subscriptions;
create policy "own subscription" on public.subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
