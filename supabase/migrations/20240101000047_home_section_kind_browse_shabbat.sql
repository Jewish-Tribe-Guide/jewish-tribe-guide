-- ─────────────────────────────────────────────────────────────────────────────
-- Widens home_section.kind to add two more singleton built-in blocks:
-- 'browse' (the Browse/Search card) and 'shabbat' (Shabbat Times + Stay in
-- the Loop) — previously hardcoded fixed-first / fixed-last in Landing.tsx,
-- now reorderable/removable the same way 'featured'/'map'/'zmanim' already
-- are. Run in the Supabase SQL editor, after home_section_kind.sql.
--
-- No backfill here: Landing.tsx computes each of these two independently —
-- unshift/push a default entry when no row exists for that kind — rather
-- than through the same "any configured row exists → only show configured
-- rows" fallback the original three use (see homeSections.ts's own doc), so
-- an existing community with, say, zmanim+map already configured keeps its
-- Browse card and Shabbat row without needing a backfill or a re-run of
-- seed-home-blocks.mjs. Running that script IS still how an admin gets a
-- real, reorderable row for either of these two — see that script's own doc.
-- ─────────────────────────────────────────────────────────────────────────────

alter table home_section drop constraint if exists home_section_kind_check;
alter table home_section add constraint home_section_kind_check
  check (kind in ('section', 'featured', 'map', 'zmanim', 'browse', 'shabbat'));
