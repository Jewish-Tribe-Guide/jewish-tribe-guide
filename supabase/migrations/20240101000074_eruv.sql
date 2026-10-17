-- ─────────────────────────────────────────────────────────────────────────────
-- Eruvim (Oct 7): each eruv the guide shows, and its status as read from the
-- eruv's own site. Replaces the two eruvim written into src/data/resources.js.
--
-- One row per eruv, per community.
--
--   covers          where it goes, in words
--   website, hotline, alerts_url   the eruv's own, shown on its listing
--   status_url      the page the eruv posts its status on; null when it has
--                   none (a hotline only)
--   status_dated    the eruv dates each week's post, so last week's date
--                   means "not posted yet this week" (Lower Merion)
--   line_url        its published line (GeoJSON, or a Google My Maps link),
--                   for the map: read by step 2
--
-- Written by the guide as it reads (never by hand):
--   status          up / down / unknown, from the words on the page
--   status_words    the sentence it was read from
--   status_posted_on  the date the eruv put on it, when there is one
--   status_checked_at the last good read
--   status_error_at, status_error  the last failed read, and why
--   line            the line on the guide's map, as an admin approved it
--   line_pending    a line read from line_url that differs from `line`,
--                   waiting for an admin (the first read too)
--   line_read_at, line_error  the last read of line_url, and why it failed
--   line_approved_at, line_approved_by
--   line_leave_out  names of lines in the file an admin left out of the
--                   area ("Fall 2025 Reroute Alert")
--
-- Run in the Supabase SQL editor, before deploying the code that calls it.
-- The site works without it: the eruv page shows the old list, with links.
--
-- Server-only, as 070: RLS on, no policies, service_role grants alone. The
-- public reads it through /api/eruv.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.eruv (
  community_id      text not null,
  id                text not null,
  name              text not null,
  covers            text,
  website           text,
  hotline           text,
  alerts_url        text,
  status_url        text,
  status_dated      boolean not null default false,
  line_url          text,
  sort_order        integer not null default 0,
  active            boolean not null default true,
  status            text check (status in ('up', 'down', 'unknown')),
  status_words      text,
  status_posted_on  date,
  status_checked_at timestamptz,
  status_error_at   timestamptz,
  status_error      text,
  line              jsonb,
  line_pending      jsonb,
  line_read_at      timestamptz,
  line_error        text,
  line_approved_at  timestamptz,
  line_approved_by  text,
  line_leave_out    text[] not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (community_id, id)
);

alter table public.eruv enable row level security;
grant select, insert, update, delete on public.eruv to service_role;

-- Philadelphia's eruvim, each from its own site (read Oct 6-7 2026); the
-- University City hotline from Refuah's HUP page.
insert into public.eruv (community_id, id, name, covers, website, hotline, alerts_url, status_url, status_dated, line_url, sort_order)
select v.* from (values
  ('philly', 'center-city', 'Center City Eruv',
   'Center City and South Philadelphia, including Jefferson. Joins the University City Eruv over the South Street Bridge.',
   'https://www.centercityeruv.com/', null, 'https://www.centercityeruv.com/',
   'https://www.centercityeruv.com/', false, 'https://www.centercityeruv.com/map-data.geojson', 1),
  ('philly', 'university-city', 'University City Eruv',
   'Penn, Drexel and the West Philadelphia neighborhood around them, including HUP and CHOP. Joins the Center City Eruv over the South Street Bridge.',
   'https://www.pennocp.org/eruv', '(215) 792-3942', null,
   'https://www.pennocp.org/eruv', false, 'https://www.google.com/maps/d/viewer?mid=1PfS1qLpjM4WYW7eQITxRA8vlrs2LdROs', 2),
  ('philly', 'lower-merion', 'Lower Merion Eruv',
   'Bala Cynwyd, Merion, Narberth, Penn Valley and Wynnewood.',
   'http://lowermerioneruv.org/', '(610) 664-5626, option 3', null,
   'http://lowermerioneruv.org/wordpress/?page_id=29', true, 'https://www.google.com/maps/d/viewer?mid=1SaMJDaGuBq1fHZun3FyKUHFYsu0aYms', 3),
  ('philly', 'northeast', 'Northeast Eruv',
   'Rhawnhurst and Castor Gardens.',
   'https://jcor.org/', '(215) 333-ERUV', 'https://groups.io/g/JCOR-NE-Philadelphia',
   null, false, null, 4),
  ('philly', 'elkins-park', 'Elkins Park Eruv',
   'Elkins Park.',
   'https://www.yiep.org/eruv-map', '(267) 415-6760', null,
   null, false, null, 5)
) as v(community_id, id, name, covers, website, hotline, alerts_url, status_url, status_dated, line_url, sort_order)
where exists (select 1 from public.community where slug = 'philly')
on conflict (community_id, id) do nothing;
