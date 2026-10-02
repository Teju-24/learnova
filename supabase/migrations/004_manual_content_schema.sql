-- The new manual content uses long_intro and deep_explanation
-- instead of the legacy key_idea and universal_analogy fields.
-- Drop the NOT NULL constraints so manual inserts can omit them.
alter table concept_notes
  alter column key_idea drop not null,
  alter column universal_analogy drop not null;
