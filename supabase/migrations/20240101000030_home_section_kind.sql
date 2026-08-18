-- ─────────────────────────────────────────────────────────────────────────────
-- Widens `home_section` from "just titled category groups" to the desktop
-- home screen's full block order (run in Supabase SQL editor, after
-- communities.sql).
--
-- `kind` = 'section' (the default, and every existing row) is a plain named
-- category group, unchanged. The other three kinds are new, singleton,
-- built-in blocks — the featured-cards row, the embedded map, and the Zmanim
-- & Shabbos band — each identified by its own kind as a fixed id (there can
-- only ever be one 'featured', one 'map', one 'zmanim' row). Reordering or
-- removing any of them from the home screen is just reordering/deleting a
-- row in this same table, same as a category section — see
-- src/lib/homeSections.ts's BUILT_IN_BLOCKS and Landing.tsx's ordered walk.
--
-- After running this DDL, seed the three built-in rows (idempotent — safe to
-- run again) at their current default position — before this migration,
-- these three were hardcoded fixed positions in Landing.tsx (featured/map
-- first, zmanim last), so seeding them there preserves exactly what's live
-- today until an admin actually reorders something:
--   node --env-file=.env.local scripts/seed-home-blocks.mjs
-- ─────────────────────────────────────────────────────────────────────────────

alter table home_section add column if not exists kind text not null default 'section';
alter table home_section add constraint home_section_kind_check
  check (kind in ('section', 'featured', 'map', 'zmanim'));

-- At most one row per community per built-in kind — 'section' is excluded
-- (there can be any number of plain sections), enforced by only indexing the
-- three singleton kinds.
create unique index if not exists home_section_singleton_kind_idx
  on home_section (community_id, kind)
  where kind <> 'section';
