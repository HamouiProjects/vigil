-- 0007_brief_schedules.sql — scheduled brief delivery (T5a.3)
begin;
create table if not exists public.brief_schedules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cadence      text not null check (cadence in ('daily', 'weekly', 'monthly', 'quarterly', 'annually')),
  channel      text not null default 'email' check (channel in ('email')),
  next_run_at  timestamptz not null,
  last_run_at  timestamptz,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (user_id, workspace_id)
);
create index if not exists brief_schedules_user_idx on public.brief_schedules (user_id);
create index if not exists brief_schedules_due_idx  on public.brief_schedules (next_run_at) where active;
alter table public.brief_schedules enable row level security;
create policy brief_schedules_select_own on public.brief_schedules
  as permissive for select to authenticated
  using ((auth.uid() = user_id));
create policy brief_schedules_insert_own on public.brief_schedules
  as permissive for insert to authenticated
  with check ((auth.uid() = user_id));
create policy brief_schedules_update_own on public.brief_schedules
  as permissive for update to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy brief_schedules_delete_own on public.brief_schedules
  as permissive for delete to authenticated
  using ((auth.uid() = user_id));
commit;
