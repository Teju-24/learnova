-- ============================================================
-- A1. Durable lesson state on the learner row
-- ============================================================
-- lesson_progress   : { "<conceptId>:<tier>": { last_step, completed_at } }
--                    lets a learner resume mid-lesson and keeps a
--                    review path open after a passing test.
-- weakness_sections : { "<conceptId>:<tier>": { weak_sections, review_step } }
--                    which timeline sections a failed test exposed.
-- test_reviews      : { "<conceptId>:<tier>": { questions, answers,
--                                               verdicts, reasons,
--                                               submitted_at } }
--                    the answer key behind the last test attempt.
--
-- Existing rows get empty objects, so no re-seeding is required.
alter table learners
  add column if not exists lesson_progress   jsonb not null default '{}'::jsonb,
  add column if not exists weakness_sections jsonb not null default '{}'::jsonb,
  add column if not exists test_reviews       jsonb not null default '{}'::jsonb;
