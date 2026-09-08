-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a dedicated eyebrow/heading pair for each of the desktop home
-- screen's six cards (Davening Times, Update Listings, Map, Email Signup,
-- Jewish Times — Browse/Search's pair, desktop_browse_eyebrow/heading,
-- already exists from an earlier migration). Replaces the 'map' block's old
-- reliance on its home_section row's own `title` for a heading — every
-- built-in card now works the same way, a dedicated SiteSettings field, not
-- a mix of some using home_section.title and some not.
--
-- `featured_card_ids` (added by site_settings_featured_cards.sql) is left in
-- place, unused — the Featured cards feature was removed from admin (see
-- homeSections.ts's own doc); dropping a column isn't this repo's pattern
-- (every migration here only ever adds), and the column is harmless sitting
-- unread. Run in the Supabase SQL editor, after site_settings_desktop_admin.sql.
-- ─────────────────────────────────────────────────────────────────────────────

alter table site_settings add column if not exists desktop_davening_eyebrow text;
alter table site_settings add column if not exists desktop_davening_heading text;
alter table site_settings add column if not exists desktop_listings_eyebrow text;
alter table site_settings add column if not exists desktop_listings_heading text;
alter table site_settings add column if not exists desktop_map_eyebrow text;
alter table site_settings add column if not exists desktop_map_heading text;
alter table site_settings add column if not exists desktop_subscribe_eyebrow text;
alter table site_settings add column if not exists desktop_subscribe_heading text;
alter table site_settings add column if not exists desktop_jewish_times_heading text;
