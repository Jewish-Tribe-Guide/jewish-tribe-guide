-- An eruv's own fields (Nov 9 2026).
--
-- The Eruv page has Fields like every category page: what an opened eruv
-- shows, in which boxes. Where it goes, Website, Hotline and Email alerts
-- are the eruv table's own columns. A field an admin makes there ("Certified
-- by") has nowhere to go, so each eruv keeps them here, by field key, as a
-- listing keeps its own in resource.details (src/lib/eruvFields.ts).
--
-- Run in the Supabase SQL editor. The site works without it: the Eruv page
-- shows its own four fields, and saving a value for a field made there
-- fails until it's run.

alter table public.eruv add column if not exists details jsonb not null default '{}'::jsonb;
