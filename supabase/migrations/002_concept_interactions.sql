-- Pre-generated interaction sequences, one row per (concept, tier).
create table if not exists concept_interactions (
  id          bigserial primary key,
  concept_id  int not null references concepts(id) on delete cascade,
  tier        text not null check (tier in ('beginner','intermediate','advanced')),
  sequence    jsonb not null,
  created_at  timestamptz not null default now(),
  unique (concept_id, tier)
);

alter table concept_interactions enable row level security;
drop policy if exists "concept_interactions public read" on concept_interactions;
create policy "concept_interactions public read" on concept_interactions
  for select using (true);
