-- ─────────────────────────────────────────────────────────────────────────────
-- Adds two more singleton pseudo-category kinds (run in Supabase SQL editor,
-- after mikvah_short_labels.sql): 'eruv' (the Eruv Information card) and
-- 'medical' (the Jewish Medical Resources card). Same pattern as 'map'/'zmanim'
-- from category_kind.sql — an admin can add/remove at most one of each from the
-- category manager, with no fields to configure; the site reads their presence
-- to decide whether to show the corresponding hand-built card/page, replacing
-- the old always-on community.config feature flags for these two.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category drop constraint if exists category_kind_check;
alter table category add constraint category_kind_check
  check (kind in ('listing', 'map', 'zmanim', 'eruv', 'medical'));

drop index if exists category_kind_singleton;
create unique index if not exists category_kind_singleton on category (kind)
  where kind in ('map', 'zmanim', 'eruv', 'medical');
