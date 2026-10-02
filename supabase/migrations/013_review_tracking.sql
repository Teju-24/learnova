-- ============================================================
-- 013_reviewer_tracking.sql — per-concept last-seen timestamps
-- ============================================================
-- "Review" resurfaces concepts a learner is weak in or has not touched
-- recently, which needs to know when they last saw each concept. Nothing in
-- the schema recorded that: test_attempts only holds test sittings,
-- concept_open_log holds only a concept's FIRST open (it is unique per
-- user+concept, built for a "10 distinct concepts" badge), and
-- lesson_progress is a JSON blob on learners with no per-entry timestamp.
--
-- So this adds one row per (learner, concept) with the two timestamps review
-- needs, and every path that represents "the learner saw this concept" calls
-- touch_concept_seen() to move last_seen forward.
--
-- The backfill below reconstructs what it can from test_attempts, which is
-- the only per-concept timestamped history that exists. It is deliberately
-- conservative: it can only ever set last_seen EARLIER than the true value, so
-- a concept may be flagged for review slightly early, but it is never flagged
-- as fresh when it is actually stale. Correcting itself from the first real
-- touch onwards.
create table if not exists learner_concepts (
  user_id    uuid not null references auth.users(id) on delete cascade,
  concept_id int  not null references concepts(id) on delete cascade,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (user_id, concept_id)
);

alter table learner_concepts enable row level security;

drop policy if exists "own learner concepts" on learner_concepts;
create policy "own learner concepts" on learner_concepts
  for select using (auth.uid() = user_id);

-- Insert and update are only ever reached through touch_concept_seen(), which
-- takes its user from auth.uid() rather than a parameter, so a caller cannot
-- write a row for somebody else. The with-check mirrors the select policy so
-- that stays true even if a future caller upserts directly.
drop policy if exists "own learner concept inserts" on learner_concepts;
create policy "own learner concept inserts" on learner_concepts
  for insert with check (auth.uid() = user_id);

drop policy if exists "own learner concept updates" on learner_concepts;
create policy "own learner concept updates" on learner_concepts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Staleness is the hot path: review reads every concept on the learner's path
-- and only the concept + timestamp.
create index if not exists learner_concepts_last_seen_idx
  on learner_concepts (user_id, last_seen desc);

-- ============================================================
-- RPC: touch_concept_seen
-- ============================================================
-- Moves last_seen forward for the calling learner. never backwards: a late
-- write (a request that started before another one landed) must not make a
-- concept look fresher than it is. Returns the stored last_seen.
create or replace function public.touch_concept_seen(p_concept_id int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_seen timestamptz;
begin
  if v_user is null then
    raise exception 'touch_concept_seen: not authenticated';
  end if;

  insert into public.learner_concepts (user_id, concept_id, first_seen, last_seen)
  values (v_user, p_concept_id, now(), now())
  on conflict (user_id, concept_id) do update
    set first_seen = least(learner_concepts.first_seen, excluded.first_seen),
        last_seen  = greatest(learner_concepts.last_seen, excluded.last_seen)
  returning last_seen into v_seen;

  return v_seen;
end;
$$;

grant execute on function public.touch_concept_seen(int) to authenticated;

-- ============================================================
-- Backfill from what history already exists
-- ============================================================
-- Test sittings first: the one source with a real per-concept timestamp.
insert into public.learner_concepts (user_id, concept_id, first_seen, last_seen)
select
  ta.user_id,
  ta.concept_id,
  min(ta.created_at),
  max(ta.created_at)
from public.test_attempts ta
group by ta.user_id, ta.concept_id
on conflict (user_id, concept_id) do update
  set first_seen = least(learner_concepts.first_seen, excluded.first_seen),
      last_seen  = greatest(learner_concepts.last_seen, excluded.last_seen);

-- Then first opens. This only ever lowers last_seen (see the note above):
-- concept_open_log records the first open and never updates, so a learner who
-- has read the concept daily still shows their original open date here. The
-- value is right for "opened and abandoned", conservative for "still using",
-- and the write paths take over from the first touch onwards.
insert into public.learner_concepts (user_id, concept_id, first_seen, last_seen)
select
  col.user_id,
  col.concept_id,
  col.created_at,
  col.created_at
from public.concept_open_log col
on conflict (user_id, concept_id) do update
  set first_seen = least(learner_concepts.first_seen, excluded.first_seen),
      last_seen  = least(learner_concepts.last_seen, excluded.last_seen);
