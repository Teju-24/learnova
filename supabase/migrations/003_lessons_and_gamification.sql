-- ============================================================
-- A1. Extend concept_notes with deeper content
-- ============================================================
alter table concept_notes
  add column if not exists long_intro       text,
  add column if not exists deep_explanation jsonb not null default '[]'::jsonb,
  add column if not exists real_world_usage text,
  add column if not exists key_takeaways    jsonb not null default '[]'::jsonb;

-- ============================================================
-- A2. concept_timeline — interleaved sections + activities
-- ============================================================
create table if not exists concept_timeline (
  id          bigserial primary key,
  concept_id  int not null references concepts(id) on delete cascade,
  tier        text not null check (tier in ('beginner','intermediate','advanced')),
  timeline    jsonb not null,
  created_at  timestamptz not null default now(),
  unique (concept_id, tier)
);

alter table concept_timeline enable row level security;
drop policy if exists "concept_timeline public read" on concept_timeline;
create policy "concept_timeline public read" on concept_timeline
  for select using (true);

-- ============================================================
-- A3. concept_test — 5 questions per (concept, tier)
-- ============================================================
create table if not exists concept_test (
  id          bigserial primary key,
  concept_id  int not null references concepts(id) on delete cascade,
  tier        text not null check (tier in ('beginner','intermediate','advanced')),
  questions   jsonb not null,
  created_at  timestamptz not null default now(),
  unique (concept_id, tier)
);

alter table concept_test enable row level security;
drop policy if exists "concept_test public read" on concept_test;
create policy "concept_test public read" on concept_test
  for select using (true);

-- ============================================================
-- A4. test_attempts — every test a learner takes
-- ============================================================
create table if not exists test_attempts (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  concept_id  int not null references concepts(id) on delete cascade,
  tier        text not null,
  score       numeric not null,
  passed      boolean not null,
  answers     jsonb,
  created_at  timestamptz not null default now()
);

alter table test_attempts enable row level security;
drop policy if exists "own test attempts" on test_attempts;
create policy "own test attempts" on test_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- A5. Extend learners with gamification fields
-- ============================================================
alter table learners
  add column if not exists sparks            int not null default 0,
  add column if not exists current_streak    int not null default 0,
  add column if not exists longest_streak    int not null default 0,
  add column if not exists last_active_date  date,
  add column if not exists last_read_date    date,
  add column if not exists last_activity_date date,
  add column if not exists badges            jsonb not null default '[]'::jsonb;

-- ============================================================
-- A6. daily_activity — one row per user per day
-- ============================================================
create table if not exists daily_activity (
  id                     bigserial primary key,
  user_id                uuid not null references auth.users(id) on delete cascade,
  date                   date not null,
  read_lessons           int not null default 0,
  interactions_completed int not null default 0,
  sparks_earned          int not null default 0,
  unique (user_id, date)
);

alter table daily_activity enable row level security;
drop policy if exists "own daily activity" on daily_activity;
create policy "own daily activity" on daily_activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- A7. sparks_log — feed of spark events
-- ============================================================
create table if not exists sparks_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  amount      int not null,
  reason      text not null,
  created_at  timestamptz not null default now()
);

alter table sparks_log enable row level security;
drop policy if exists "own sparks log" on sparks_log;
create policy "own sparks log" on sparks_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- A8. concept_open_log — to track "10 distinct concepts opened"
-- ============================================================
create table if not exists concept_open_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  concept_id  int not null references concepts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (user_id, concept_id)
);

alter table concept_open_log enable row level security;
drop policy if exists "own concept opens" on concept_open_log;
create policy "own concept opens" on concept_open_log
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- RPC: increment_daily_activity
-- ============================================================
create or replace function public.increment_daily_activity(
  p_user_id uuid,
  p_date date,
  p_read int,
  p_interactions int,
  p_sparks int
) returns void language plpgsql security definer as $$
begin
  insert into public.daily_activity
    (user_id, date, read_lessons, interactions_completed, sparks_earned)
  values (p_user_id, p_date, p_read, p_interactions, p_sparks)
  on conflict (user_id, date) do update set
    read_lessons = daily_activity.read_lessons + p_read,
    interactions_completed = daily_activity.interactions_completed + p_interactions,
    sparks_earned = daily_activity.sparks_earned + p_sparks;
end;
$$;
