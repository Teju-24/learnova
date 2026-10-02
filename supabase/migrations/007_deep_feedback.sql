-- ============================================================
-- 007_deep_feedback.sql — higher-frequency and deeper check-ins
-- ============================================================
-- Migration 006 raised one light check-in per 3 completed concepts.
-- From here:
--   * light check-in  — every 2 completed concepts (threshold now 2)
--   * deep check-in   — every 5 completed concepts
--
-- Both flags are raised by /api/test-submit and cleared by /api/feedback.
-- last_deep_feedback_at remembers the concept count at which the learner
-- last answered a deep check-in, so the 5-concept boundary is asked once.
alter table learners
  add column if not exists show_deep_feedback_prompt boolean
    not null default false;
alter table learners
  add column if not exists last_deep_feedback_at int
    not null default 0;

-- The deep check-in also asks for a 1-5 recommendation score, and records
-- which flavour of check-in produced each row.
alter table feedback
  add column if not exists rating int
    check (rating is null or (rating >= 1 and rating <= 5));
alter table feedback
  add column if not exists variant text;  -- 'light' | 'deep'