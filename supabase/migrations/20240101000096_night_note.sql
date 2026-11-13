-- ─────────────────────────────────────────────────────────────────────────────
-- What the night's jobs saw that nobody has to decide, kept for the one
-- nightly email to the admins (Nov 12 2026, src/lib/nightlyEmail.ts).
-- Before it, every watch and job sent its own email; now one goes out per
-- community after the last job. What waits on To do is read from the
-- submission table itself, and a watch that broke from the watch, so
-- only what leaves no trace of its own is kept here: today, Google
-- marking a place closed or open again (the listing already shows it).
--
--   community_id  the community it happened in
--   kind          'google-status' (src/lib/nightNoteStore.ts)
--   body          what happened: { name, category, from, to }
--   created_at    when
--
-- Written by the jobs, never by hand. Rows older than two weeks are
-- pruned as new ones are written.
--
-- Run in the Supabase SQL editor. The site works without it: Google's
-- status changes are emailed straight away, as they were before.
--
-- Server-only, as 070, 080 and 086: RLS on, no policies, service_role
-- grants alone.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.night_note (
  id           uuid primary key default gen_random_uuid(),
  community_id text not null,
  kind         text not null,
  body         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists night_note_community_created on public.night_note (community_id, created_at desc);

alter table public.night_note enable row level security;

grant select, insert, update, delete on public.night_note to service_role;
