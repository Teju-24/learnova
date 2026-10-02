-- ============================================================
-- 008_concept_completion.sql — progression is not gated on the test
-- ============================================================
-- lesson_progress[...].completed_at means "passed the test". That made a
-- learner who finished every section and activity but did not pass stay
-- locked out of the next concept.
--
-- concept_completed_at is the unlock signal: it is written when EITHER the
-- timeline was finished (last step reached and at least one activity
-- answered, via /api/lesson-progress) OR the test was passed (via
-- /api/test-submit). Whichever happens first. It stays set once written.
--
-- Keyed the same way as lesson_progress: `${concept_id}:${tier}`.
alter table learners
  add column if not exists concept_completed_at jsonb
    not null default '{}'::jsonb;