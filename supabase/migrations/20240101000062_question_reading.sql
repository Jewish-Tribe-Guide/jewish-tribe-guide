-- ─────────────────────────────────────────────────────────────────────────────
-- The question reader's memory (decided Sep 30): each question the AI has
-- read, and what it read it as, so the same question is never sent twice
-- (a repeat is instant and free), and so an admin can see what the reader
-- understood that the site's own search didn't, and make it a rule.
--
-- Run in the Supabase SQL editor. The reader works without this table: it
-- just reads every question afresh, and says so in the server log.
--
-- Server-only, as 057 and 058: RLS on, no policies, service_role grants alone.
-- `key` is the question normalised (see questionKey in questionReader.ts).
--
-- An admin approves a reading on the "Read questions" tab (approved_at,
-- approved_by): a rule a person has checked, used with no AI at all, even
-- when the reader is switched off or over its limits. An unapproved one is
-- the AI's alone, and only reused while the reader is on.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists question_reading (
  community_id text not null,
  key          text not null,
  question     text not null,
  reading      jsonb not null,
  model        text not null,
  hits         integer not null default 1,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  approved_at  timestamptz,
  approved_by  text,
  primary key (community_id, key)
);

create index if not exists question_reading_created on question_reading (community_id, created_at desc);

alter table question_reading enable row level security;
grant select, insert, update, delete on public.question_reading to service_role;
