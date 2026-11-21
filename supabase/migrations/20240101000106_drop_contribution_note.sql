-- Drop site_settings.contribution_note (Nov 21 2026, the health sweep).
--
-- Migration 033 added it for a contribution note the site no longer has;
-- the feature and 033 were deleted together (Aug 27), but nothing dropped
-- the column. Nothing in the site or the scripts reads or writes it.
--
-- Run in the Supabase SQL editor, dev then live. Safe to run twice.

alter table public.site_settings drop column if exists contribution_note;

insert into public.migration_ran (name) values ('20240101000106_drop_contribution_note') on conflict (name) do nothing;
