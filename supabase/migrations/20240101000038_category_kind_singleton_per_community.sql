-- ─────────────────────────────────────────────────────────────────────────────
-- category_kind_singleton was never scoped to community_id.
--
-- 20240101000020 made 'map'/'zmanim'/'eruv'/'medical' singletons with a
-- unique index on (kind) alone. 20240101000027 (multi-community) made every
-- other uniqueness constraint on `category` composite with community_id —
-- its own primary key included — but this index was missed, so it kept
-- enforcing "at most one Map category in the entire database" instead of
-- "at most one per community". Philly having a 'map' category made it
-- impossible for ANY other community to ever have one: creating a second
-- community and cloning Philly's categories failed outright with
-- `duplicate key value violates unique constraint "category_kind_singleton"`,
-- and even starting a fresh community empty and manually adding a Map card
-- from the category manager would have hit the same wall.
-- ─────────────────────────────────────────────────────────────────────────────

drop index if exists category_kind_singleton;
create unique index if not exists category_kind_singleton on category (community_id, kind)
  where kind in ('map', 'zmanim', 'eruv', 'medical');
