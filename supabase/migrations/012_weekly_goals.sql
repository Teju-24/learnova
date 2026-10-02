-- ============================================================
-- 012_weekly_goals.sql — learner-set weekly targets
-- ============================================================
-- Two self-set targets per learner, shown on the profile page next to how far
-- they have got this week. The defaults (2 concepts, 30 minutes) are a
-- deliberate starting point rather than a recommendation: the point of the
-- section is that the learner edits them.
--
-- Neither column is a promise or a contract. They are only ever compared
-- against a rolling 7-day window, so there is no week boundary to reset and
-- nothing to roll over. Progress is computed at read time from
-- learners.concept_completed_at and daily_activity, never stored — a stored
-- progress counter would drift every time a day closed without a learner
-- present.
alter table learners
  add column if not exists weekly_goal_concepts int not null default 2,
  add column if not exists weekly_goal_minutes int not null default 30;
