-- ─────────────────────────────────────────────────────────────────────────────
-- Adds the desktop-only home screen settings that the desktop redesign
-- shipped hardcoded in source with no admin control: the search placeholder
-- (shared by both devices), the header's top nav structure, the Browse/Search
-- card's eyebrow + heading, the hero band's headline/subhead/photo, and the
-- home screen's accent color.
--
-- Every column is nullable and every reader (siteSettingsStore.ts's
-- toSettings) falls back sensibly when null — a fresh install, or an
-- existing row saved before this migration, behaves exactly as it did
-- before this column existed. Run in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

alter table site_settings add column if not exists search_placeholder text;
alter table site_settings add column if not exists desktop_nav_items jsonb;
alter table site_settings add column if not exists desktop_browse_eyebrow text;
alter table site_settings add column if not exists desktop_browse_heading text;
alter table site_settings add column if not exists desktop_hero_headline text;
alter table site_settings add column if not exists desktop_hero_subhead text;
alter table site_settings add column if not exists desktop_hero_image jsonb;
alter table site_settings add column if not exists desktop_accent_color text;
