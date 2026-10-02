-- ─────────────────────────────────────────────────────────────────────────────
-- The Today home (step 6) — see SiteSettings.homeStyle and beforeCandleItems.
--
-- home_style: which home page visitors get. 'classic' is the home as it was
-- before the redesign; 'today' is the one that changes with the day. An
-- admin previews Today from the Site tab before saving it, and one save
-- switches back.
--
-- before_candle_items: the items Today's "Before candles" answer looks for on
-- a Friday or Erev Yom Tov, in order, e.g. ["Challah", "Wine", "Chicken"].
-- The guide can't tell which items are for Shabbos, so an admin names them.
-- Null means the built-in starting list.
--
-- today_hidden: the Today home's blocks an admin has turned off, by id, e.g.
-- ["openNow"] (see TODAY_BLOCKS in src/lib/siteSettings.ts). Null or empty
-- means every block shows on the days it's for.
--
-- The code reads a row the same way whether or not these columns exist yet;
-- only changing one of these settings needs them.
-- ─────────────────────────────────────────────────────────────────────────────

alter table site_settings add column if not exists home_style text not null default 'classic';
alter table site_settings drop constraint if exists site_settings_home_style_check;
alter table site_settings add constraint site_settings_home_style_check check (home_style in ('classic', 'today'));
alter table site_settings add column if not exists before_candle_items jsonb;
alter table site_settings add column if not exists today_hidden jsonb;
