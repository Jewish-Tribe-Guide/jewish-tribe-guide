-- ─────────────────────────────────────────────────────────────────────────────
-- Adds the desktop home screen's featured card trio to site_settings (run in
-- the Supabase SQL editor, after site_settings_logo.sql). These are the three
-- cards shown between the search box and the map — admin-picked in the Site
-- tab, stored as an ordered array of CardDef ids (category slugs, or fixed
-- ids like 'support').
--
-- Null/empty (the default) falls back to the first three cards the home
-- sections list, so a fresh install still shows something sensible without
-- anyone having to configure it. Desktop only — mobile's home screen keeps
-- the full card grid and never reads this.
-- ─────────────────────────────────────────────────────────────────────────────

alter table site_settings add column if not exists featured_card_ids text[];
