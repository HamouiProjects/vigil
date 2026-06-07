-- Vigil — initial schema baseline (public schema)
-- Captured from production (project ratgsktlsefxxsxddtzm) and replay-verified.
-- Target: a fresh Supabase project. Assumes the platform-provided pieces already
-- exist: the `auth` schema + `auth.users`, the `auth.uid()` helper, the
-- `anon` / `authenticated` / `service_role` roles, and Supabase's default
-- privileges (which auto-grant anon/authenticated on new public objects).

begin;

-- ── Tables ──────────────────────────────────────────────────────────────────
create table public.feed_cache (
  feed_url   text not null,
  title      text,
  items      jsonb not null default '[]'::jsonb,
  updated_at timestamp with time zone not null default now()
);

create table public.sources (
  id         uuid not null default gen_random_uuid(),
  user_id    uuid,
  type       text not null,
  identifier text not null,
  label      text,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table public.subscriptions (
  user_id                uuid not null,
  plan                   text not null default 'free'::text,
  add_ons                text[] not null default '{}'::text[],
  team_id                uuid,
  status                 text not null default 'active'::text,
  updated_at             timestamp with time zone not null default now(),
  stripe_customer_id     text,
  stripe_subscription_id text
);

create table public.workspaces (
  id          uuid not null default gen_random_uuid(),
  user_id     uuid,
  name        text default 'Workspace 1'::text,
  layout      jsonb,
  updated_at  timestamp with time zone default now(),
  local_id    text,
  created_at  timestamp with time zone default now(),
  widgets     jsonb not null default '[]'::jsonb,
  settings    jsonb not null default '{}'::jsonb,
  "position"  integer not null default 0,
  share_token text,
  is_public   boolean not null default false,
  public_slug text
);

-- ── Primary keys / foreign keys / unique constraints ─────────────────────────
alter table public.feed_cache    add constraint feed_cache_pkey            primary key (feed_url);

alter table public.sources       add constraint sources_pkey              primary key (id);
alter table public.sources       add constraint sources_user_id_fkey      foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.subscriptions add constraint subscriptions_pkey        primary key (user_id);
alter table public.subscriptions add constraint subscriptions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.workspaces    add constraint workspaces_pkey           primary key (id);
alter table public.workspaces    add constraint workspaces_user_id_fkey   foreign key (user_id) references auth.users(id);
alter table public.workspaces    add constraint workspaces_user_id_local_id_key unique (user_id, local_id);
alter table public.workspaces    add constraint workspaces_share_token_key unique (share_token);

-- ── Indexes ──────────────────────────────────────────────────────────────────
create unique index sources_user_type_ident_uidx on public.sources    using btree (user_id, type, identifier);
create unique index workspaces_public_slug_key   on public.workspaces using btree (public_slug) where (public_slug is not null);
-- NOTE: workspaces_user_local_uidx duplicates the workspaces_user_id_local_id_key
-- unique constraint above (same columns). Preserved to match production exactly;
-- safe to drop one as a post-launch cleanup.
create unique index workspaces_user_local_uidx   on public.workspaces using btree (user_id, local_id);

-- ── Row Level Security ───────────────────────────────────────────────────────
alter table public.feed_cache    enable row level security;
alter table public.sources       enable row level security;
alter table public.subscriptions enable row level security;
alter table public.workspaces    enable row level security;

-- feed_cache intentionally has RLS enabled with NO policies: all client access is
-- denied; only the service role (which bypasses RLS) reads/writes it from /api/rss.

-- ── Policies ─────────────────────────────────────────────────────────────────
create policy "own workspaces" on public.workspaces
  as permissive for all to public
  using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

create policy "own sources" on public.sources
  as permissive for all to public
  using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));

-- Client access to subscriptions is SELECT-only (own row). All writes are
-- server-authoritative via the Stripe webhook (service role bypasses RLS),
-- so no client write policy exists — this prevents self-granting a paid plan.
create policy subscriptions_select_own on public.subscriptions
  as permissive for select to authenticated
  using ((auth.uid() = user_id));

-- ── Functions ────────────────────────────────────────────────────────────────
create or replace function public.get_public_room(p_slug text)
  returns table(name text, widgets jsonb, layout jsonb, sources jsonb)
  language sql
  stable
  security definer
  set search_path to ''
as $function$
  with room as (
    select * from public.workspaces
    where public_slug = p_slug and is_public = true
    limit 1
  ),
  ref_ids as (
    select distinct (feed->>'sourceId') as sid
    from room,
         lateral jsonb_array_elements(room.widgets) as w,
         lateral jsonb_array_elements(coalesce(w->'config'->'feeds', '[]'::jsonb)) as feed
    where (feed->>'sourceId') is not null
  )
  select
    room.name,
    room.widgets::jsonb,
    room.layout::jsonb,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
         'id', s.id, 'type', s.type, 'identifier', s.identifier,
         'label', s.label, 'meta', s.meta
       ))
       from public.sources s
       where s.id::text in (select sid from ref_ids)),
      '[]'::jsonb
    ) as sources
  from room;
$function$;

grant execute on function public.get_public_room(text) to anon, authenticated;

commit;
