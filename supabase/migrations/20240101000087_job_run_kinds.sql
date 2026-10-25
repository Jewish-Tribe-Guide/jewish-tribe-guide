-- What each nightly run read, per kind of source (Oct 25 2026).
--
-- The Watches tab's "Last night" gives each kind of source a line: Google,
-- Kosher certification, Hospitals, Eruvs, Minyan times, Websites, Menus
-- (src/lib/nightKinds.ts). Last night comes from the sources themselves;
-- the nights before need what each run read, saved with it.
--
--   kinds   { <community>: { <kind>: { of, read } } }: how many of each
--           kind's sources the run had, and how many it read. Saved by the
--           watches run and Google's (sync-hours); null on every other
--           job's runs, and on runs from before this.
--
-- Run in the Supabase SQL editor. The site works without it: the runs
-- save as before, without their counts, and the tab shows the nights
-- before as "Not counted".

alter table public.job_run add column if not exists kinds jsonb;
