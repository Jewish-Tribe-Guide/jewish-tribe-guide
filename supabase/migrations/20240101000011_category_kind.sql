-- ─────────────────────────────────────────────────────────────────────────────
-- Category "kind" discriminator (run in Supabase SQL editor, after
-- category_capabilities.sql).
--
-- Every category row has been a real listing directory until now. This adds a
-- `kind` column so the admin can also add/remove two singleton pseudo-categories
-- that ride the same table/CRUD but render as fixed, code-driven screens instead
-- of a generic directory: 'map' (the sitewide Map, whose presence also unlocks
-- the per-listing-category "Map button" capability) and 'zmanim' (the Zmanim &
-- Shabbos card). At most one row of each may exist — enforced by the partial
-- unique index below, not just the admin UI.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists kind text not null default 'listing';

alter table category drop constraint if exists category_kind_check;
alter table category add constraint category_kind_check check (kind in ('listing', 'map', 'zmanim'));

create unique index if not exists category_kind_singleton on category (kind) where kind in ('map', 'zmanim');
