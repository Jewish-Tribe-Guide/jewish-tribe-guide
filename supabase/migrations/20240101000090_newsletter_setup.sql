-- ─────────────────────────────────────────────────────────────────────────────
-- Each community's own newsletter key (Oct 29 2026, admin drawing 18).
--
-- The Gmail script (scripts/newsletter-apps-script.js) proves itself to the
-- site with a key. There used to be one, NEWSLETTER_SECRET, for the whole
-- site, so it could never be shown to a community's admin: it would let
-- them post into any community. Now the console hands each community a
-- script with its own key already in it (Watches → Newsletters), good for
-- that community alone. NEWSLETTER_SECRET still works for every community,
-- so a script already running with it carries on.
--
--   community_id  the community's slug, one row each
--   key           what the script sends; made the first time an admin
--                 opens Newsletters
--   checked_at    the last time the script asked for its senders (once
--                 an hour), with either key: "Last checked 3:00 PM"
--   account       the Gmail it runs in, as the script says
--
-- Run in the Supabase SQL editor. Without it, the page says newsletters
-- can't be set up here yet, and NEWSLETTER_SECRET works as before.
--
-- Server-only, as 070 and 086: RLS on, no policies, service_role grants
-- alone. The key is a secret.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.newsletter_setup (
  community_id text primary key,
  key          text not null unique,
  created_at   timestamptz not null default now(),
  checked_at   timestamptz,
  account      text
);

alter table public.newsletter_setup enable row level security;
grant select, insert, update, delete on public.newsletter_setup to service_role;
