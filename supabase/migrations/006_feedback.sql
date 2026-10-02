-- ============================================================
-- 006_feedback.sql — learner check-ins that steer the path
-- ============================================================
-- Every 3 completed concepts the learner answers a short check-in on the
-- /me dashboard. The answer is stored here and read by /api/extend-path
-- when it picks the next batch of concepts.
--
-- pace is a free-text column on purpose: the UI offers three buttons, but
-- the route validates against the same set and new values need no migration.
create table if not exists feedback (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  concept_id  int references concepts(id) on delete set null,
  pace        text,          -- 'too_slow' | 'just_right' | 'too_fast'
  interests   text,          -- free-text topics they want more of
  notes       text,          -- optional free-text
  created_at  timestamptz not null default now()
);

alter table feedback enable row level security;
drop policy if exists "own feedback" on feedback;
create policy "own feedback" on feedback
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Checkpoint bookkeeping on the learner row.
-- show_feedback_prompt is raised by /api/test-submit once
-- (concepts_completed - last_feedback_at_concept_count) >= 3, and cleared
-- by /api/feedback.
alter table learners
  add column if not exists last_feedback_at_concept_count int
    not null default 0;
alter table learners
  add column if not exists show_feedback_prompt boolean
    not null default false;
