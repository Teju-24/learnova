-- ============================================================
-- 010_certificates.sql — one completion certificate per learner
-- ============================================================
-- Issued by /api/issue-certificate once the learner has mastered 16 of the 20
-- concepts. The row is a snapshot, not a live query: the name and the two
-- numbers are copied at issue time so a certificate never changes after it is
-- awarded, even if the learner later edits their name or earns more Sparks.
--
-- `unique (user_id)` is what makes issuing idempotent — the route can be called
-- repeatedly and the learner keeps the original issue date and id.
create table if not exists certificates (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  issued_at           timestamptz not null default now(),
  learner_name        text not null,
  concepts_completed  int  not null,
  total_sparks        int  not null,
  unique (user_id)
);

alter table certificates enable row level security;

drop policy if exists "own certificate" on certificates;
create policy "own certificate" on certificates
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
