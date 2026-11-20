-- Which community a job's run was for (Nov 20 2026, src/lib/jobRunStore.ts).
--
-- The morning watches ran as one run for every community, in one function's
-- five minutes: each community added made the others' share smaller. Now
-- /api/cron/watches starts a run of its own per community, each with its own
-- five minutes, and each is recorded under its community. A community's
-- Watches tab, nightly email and Activity read its own runs and the jobs
-- that still run for the whole site.
--
--   community_id  the community the run was for; null for a run of the
--                 whole site (every other job, and the watches before this)
--
-- Run in the Supabase SQL editor. The site works without it: each
-- community's run is still made, saved without its community.

alter table public.job_run add column if not exists community_id text;

create index if not exists job_run_job_community_started
  on public.job_run (job, community_id, started_at desc);
