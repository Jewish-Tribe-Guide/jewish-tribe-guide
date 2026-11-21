-- Drop site_settings.map_zoom_radius_miles (Nov 21 2026, the restore drill).
--
-- The map's zoom cap moved to the Map category (migration 029,
-- category.map_zoom_radius_miles, which the code reads). Live kept the old
-- site_settings column, empty in every row; no migration in the folder
-- makes it, so a project rebuilt from the folder doesn't have it.
--
-- Run in the Supabase SQL editor, dev then live. Safe to run twice.

alter table public.site_settings drop column if exists map_zoom_radius_miles;

insert into public.migration_ran (name) values ('20240101000107_drop_settings_map_zoom') on conflict (name) do nothing;
