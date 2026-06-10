create table if not exists public.briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid,
  content jsonb not null,
  period text,
  created_at timestamptz not null default now()
);

create index if not exists briefs_user_created_idx on public.briefs (user_id, created_at desc);

alter table public.briefs enable row level security;

create policy briefs_select_own on public.briefs
  as permissive for select to authenticated
  using ((auth.uid() = user_id));
