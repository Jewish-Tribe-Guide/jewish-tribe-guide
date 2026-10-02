-- ─────────────────────────────────────────────────────────────────────────────
-- What changed (step 7a): an admin can hide one change from the What changed
-- page and Today's "This week" block, e.g. an approval made by mistake and
-- then fixed. Hiding leaves the row in the log (credit still counts it) and
-- the listing untouched; clearing hidden_at shows it again.
--
-- The code reads the log the same way whether or not this column exists yet;
-- only hiding needs it.
-- ─────────────────────────────────────────────────────────────────────────────

alter table activity add column if not exists hidden_at timestamptz;
