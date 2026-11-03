-- ─────────────────────────────────────────────────────────────────────────────
-- Look again (Nov 3 2026; drawn Oct 27): a monthly second try at what a job
-- couldn't find, a few a night (/api/cron/look-again, lookAgain.ts). What it
-- tries: an eruv's status page on its website, a menu that couldn't be read,
-- a place Google has no match for. One row per thing it has tried, so it
-- can try each again a month after the last try, offer what it found, and
-- stop when an admin says so.
--
--   kind         'eruv' | 'menu' | 'google'
--   target_id    the eruv's or the listing's id
--   tried_at     its last try; null once an admin asks for one now
--   found        what the last try found, waiting on an admin (To do): an
--                eruv's status page {url, status, words, at}, or Google's
--                place {placeId, name, address, at}; null when nothing is
--   not_these    what an admin said wasn't it (Not this page), never offered
--                again: an eruv's page addresses. Google's are kept on the
--                listing (googleWrong), as Find it on Google's are.
--   stopped_at   Stop trying; null while it's still tried
--
-- Written by the job and the admin's answers, never by hand.
--
-- Run in the Supabase SQL editor. The site works without it: the job saves
-- nothing and says it isn't set up, and the page says so.
--
-- Server-only, as 086: RLS on, no policies, service_role grants alone.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.look_again (
  community_id text not null,
  kind         text not null,
  target_id    text not null,
  tried_at     timestamptz,
  found        jsonb,
  not_these    jsonb not null default '[]'::jsonb,
  stopped_at   timestamptz,
  primary key (community_id, kind, target_id)
);

alter table public.look_again enable row level security;
grant select, insert, update, delete on public.look_again to service_role;
