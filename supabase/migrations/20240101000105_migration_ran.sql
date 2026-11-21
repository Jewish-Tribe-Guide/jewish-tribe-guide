-- Which migrations have run here (Nov 20 2026, the health sweep).
--
-- Migrations are pasted into the SQL editor by hand, dev then live, and
-- nothing recorded which ran where: a missed one showed only as a feature
-- quietly off (the "table missing" fallbacks) or a save failing on live.
--
-- From this one on, every migration ends by writing its own name here.
-- `npm run migrations:report` (add `-- --prod` for live; it only reads)
-- lists what's recorded, and looks for what each earlier migration made
-- (its tables and columns) to tell whether it ran.
-- src/test/migrationsRecordThemselves.test.ts fails on a later migration
-- that doesn't write its name.
--
-- Only the service role reads or writes it: row level security on, no
-- policies, as migration 103 left every table.
--
-- Run in the Supabase SQL editor, dev then live. Safe to run twice.

create table if not exists public.migration_ran (
  name text primary key,
  ran_at timestamptz not null default now()
);

alter table public.migration_ran enable row level security;

insert into public.migration_ran (name) values ('20240101000105_migration_ran') on conflict (name) do nothing;
