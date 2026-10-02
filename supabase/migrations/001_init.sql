-- Enable UUID generation
create extension if not exists pgcrypto;

-- ============================================================
-- concepts: the static curriculum graph
-- ============================================================
create table if not exists concepts (
  id            serial primary key,
  slug          text not null unique,
  title         text not null,
  difficulty    int not null check (difficulty between 1 and 5),
  prerequisites int[] not null default '{}'
);

-- Public read for concepts
alter table concepts enable row level security;
drop policy if exists "concepts public read" on concepts;
create policy "concepts public read" on concepts
  for select using (true);

-- ============================================================
-- concept_notes: static content per (concept, tier)
-- ============================================================
create table if not exists concept_notes (
  id                    bigserial primary key,
  concept_id            int not null references concepts(id) on delete cascade,
  tier                  text not null check (tier in ('beginner','intermediate','advanced')),
  title                 text not null,
  summary               text not null,
  learning_goals        jsonb not null default '[]'::jsonb,
  key_idea              text not null,
  universal_analogy     text not null,
  formal_definition     text,
  code_example          jsonb,
  common_mistakes       jsonb not null default '[]'::jsonb,
  estimated_minutes     int not null default 6,
  created_at            timestamptz not null default now(),
  unique (concept_id, tier)
);

alter table concept_notes enable row level security;
drop policy if exists "concept_notes public read" on concept_notes;
create policy "concept_notes public read" on concept_notes
  for select using (true);

-- ============================================================
-- learners: everything about one user in one row
-- ============================================================
create table if not exists learners (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  goal             text,
  background       text,
  role_title       text,
  comfort          jsonb not null default '{"math":0.5,"code":0.5,"theory":0.5}'::jsonb,
  mastery          jsonb not null default '{}'::jsonb,
  path             jsonb not null default '[]'::jsonb,
  current_concept  int,
  lesson_cache     jsonb not null default '{}'::jsonb,
  profile_version  int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table learners enable row level security;
drop policy if exists "own learner row" on learners;
create policy "own learner row" on learners
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- practice_attempts: every answer a learner submits
-- ============================================================
create table if not exists practice_attempts (
  id            bigserial primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  concept_id    int not null references concepts(id) on delete cascade,
  tier          text not null,
  sequence      int not null,
  question      text,
  user_answer   text,
  verdict       text,
  score         numeric,
  reason        text,
  created_at    timestamptz not null default now()
);

alter table practice_attempts enable row level security;
drop policy if exists "own attempts" on practice_attempts;
create policy "own attempts" on practice_attempts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- Auth trigger: create learner row on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.learners (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
