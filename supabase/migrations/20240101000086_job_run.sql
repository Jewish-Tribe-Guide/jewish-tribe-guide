-- ─────────────────────────────────────────────────────────────────────────────
-- A record of every run of the nightly jobs (Oct 24 2026): the watches,
-- Google's hours, the menus never read, and the walks along the streets
-- (vercel.json). Each run saves one row when it starts and fills it in
-- when it finishes, so the admin Watches tab can say what each job did
-- and when it didn't work. A row never finished is a run that was cut off
-- (the watches run stopped after 29 of 107 watches on Oct 24, with
-- nothing to show for it anywhere).
--
--   job          'watches' | 'sync-hours' | 'read-menus' | 'walk-routes'
--                (src/lib/jobRuns.ts, NIGHTLY_JOBS)
--   started_at   when the run began
--   finished_at  when it ended; null while it runs, or when it was cut off
--   ok           whether it worked; null until it finishes
--   summary      what it did, in a line ("Checked 107 of 107 watches")
--   warning      what it didn't get to, when it worked ("Ran out of time:
--                27 left for the next night"), or that it isn't set up
--   error        why it didn't work
--
-- Written by the jobs, never by hand. A job keeps 60 days of its runs.
--
-- Run in the Supabase SQL editor. The site works without it: every job
-- runs as before, with nothing recorded, and the tab says so.
--
-- Server-only, as 070 and 080: RLS on, no policies, service_role grants
-- alone.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.job_run (
  id          uuid primary key default gen_random_uuid(),
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  summary     text,
  warning     text,
  error       text
);

create index if not exists job_run_job_started on public.job_run (job, started_at desc);

alter table public.job_run enable row level security;
grant select, insert, update, delete on public.job_run to service_role;
