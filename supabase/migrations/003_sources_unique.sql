-- dedupe sources per user by type + identifier (supports upsert in sourcesRepo)
create unique index if not exists sources_user_type_identifier_uidx
  on public.sources (user_id, type, identifier);
