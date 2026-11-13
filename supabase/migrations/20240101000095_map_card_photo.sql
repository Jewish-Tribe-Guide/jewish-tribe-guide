-- The computer home's map card photo (Nov 11 2026, board G3).
--
-- The "Everything on one map" card under Explore by Category shows a photo
-- the admin picks in the Site tab, next to the hero's own photo. Same shape
-- as desktop_hero_image: { url, alt }.
--
-- Run in the Supabase SQL editor. The site works without it: the card draws
-- its plain map glyph, every other setting still saves, and only choosing a
-- photo for the card says it isn't set up yet.

alter table public.site_settings add column if not exists desktop_map_image jsonb;
