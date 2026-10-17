-- ─────────────────────────────────────────────────────────────────────────────
-- How a category page groups its list — see CategoryConfig.groupBy and
-- src/lib/listGroups.ts. One of:
--
--   {"kind": "open"}                     Open now, then Not open now
--   {"kind": "distance", "miles": 2}     Within 2 mi, then Further
--   {"kind": "field", "key": "<key>"}    a yes/no field (it, then Doesn't say)
--                                        or a pick-list (one closed group
--                                        per value, alphabetical)
--
-- Null means one ungrouped list, which is how every category behaves until
-- an admin chooses a grouping in the category editor. The code reads a
-- category the same way whether or not this column exists yet; only saving
-- a grouping needs it.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists group_by jsonb;
