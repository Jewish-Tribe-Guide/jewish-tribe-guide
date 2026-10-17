-- ─────────────────────────────────────────────────────────────────────────────
-- Watches (freshness map, Oct 5): the outside pages the guide reads on its
-- own to stay current, and whether each one is still working.
--
-- One row per page. A daily cron (/api/cron/watches) reads every active
-- one; an admin adds, pauses and removes them on the admin "Watches" tab.
--
--   kind            keystone_list  Keystone-K's list of what it certifies:
--                                  differences become suggestions
--                   website        any other page, e.g. a shul's times page:
--                                  the guide notices when it changes
--   resource_id     the listing a website keeps current, if any
--   last_run_at     the last time the cron tried it
--   last_ok_at      the last time it read it properly
--   last_error      why the last try failed (null when it worked)
--   failing_since   when it started failing, so the admin is emailed once
--                   when it breaks and once when it recovers, not every day
--   last_filed      suggestions the last good read put in the queue
--   page_hash       the page's words last time, to notice a change
--   page_changed_at when the words last changed
--
-- Run in the Supabase SQL editor, before deploying the code that calls
-- these. The site works without it: the Keystone-K watch runs as before and
-- the Watches tab says the migration hasn't been run.
--
-- Server-only, as 057, 062, 064 and 065: RLS on, no policies, service_role
-- grants alone.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.watch (
  id              uuid primary key default gen_random_uuid(),
  community_id    text not null,
  kind            text not null check (kind in ('keystone_list', 'website')),
  url             text not null,
  resource_id     uuid,
  label           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      text,
  last_run_at     timestamptz,
  last_ok_at      timestamptz,
  last_error      text,
  failing_since   timestamptz,
  last_filed      integer,
  page_hash       text,
  page_changed_at timestamptz,
  unique (community_id, url)
);

alter table public.watch enable row level security;
grant select, insert, update, delete on public.watch to service_role;

-- Philadelphia's Keystone-K list, which ran from code alone until now.
insert into public.watch (community_id, kind, url, label, created_by)
select 'philly', 'keystone_list', 'https://keystone-k.org/establishments/', 'Keystone-K''s list', 'migration 070'
where exists (select 1 from public.community where slug = 'philly')
on conflict (community_id, url) do nothing;
