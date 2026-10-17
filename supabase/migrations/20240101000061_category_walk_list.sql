-- ─────────────────────────────────────────────────────────────────────────────
-- Another category's places within a walk, listed on each of this category's
-- listings — see CategoryConfig.walkList and src/lib/walkList.ts. Hotels'
-- use of it: "Synagogues within a walk" on every hotel.
--
--   {"categoryId": "synagogue", "maxMinutes": 30}
--
-- Null means no such list, which is how every category behaves until an admin
-- chooses one in the category editor. The code reads a category the same way
-- whether or not this column exists yet; only saving the choice needs it.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists walk_list jsonb;
