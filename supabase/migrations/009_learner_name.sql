-- ============================================================
-- 009_learner_name.sql — the name we are allowed to greet someone by
-- ============================================================
-- Optional. Learners who skip the onboarding step keep a null column and are
-- greeted by the local part of their email, so nothing downstream has to
-- handle a missing row.
--
-- The `check` trims the stored value: a name of "   " is stored as null rather
-- than as whitespace, which would otherwise beat the email fallback and render
-- as an empty heading on /me and on the certificate.
alter table learners
  add column if not exists learner_name text
    check (learner_name is null or length(btrim(learner_name)) > 0);
