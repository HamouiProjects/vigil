create table if not exists public.email_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null
    check (char_length(email) between 3 and 254 and position('@' in email) > 1),
  source text default 'landing',
  created_at timestamptz not null default now()
);

alter table public.email_signups enable row level security;

create policy email_signups_insert_any on public.email_signups
  as permissive for insert to anon, authenticated
  with check (true);
