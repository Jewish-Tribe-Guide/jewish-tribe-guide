-- ─────────────────────────────────────────────────────────────────────────────
-- What changed (step 7a): an approved edit says what it changed, so the What
-- changed page and Today's "This week" can say "Hours Sunday 11 AM – 10 PM"
-- instead of "updated". Each listing_edited row gets the changed fields as
-- visitors read them, [{ key, label, value, quiet? }], new values only (never
-- the old); a listing_added row gets the new place's short facts. Saved as
-- text when the edit is approved, so a later rename of a field leaves a past
-- change saying what it said that day.
--
-- Rows from before this have none, and say "updated", as they always have.
-- The code reads and writes the log the same way whether or not this column
-- exists yet.
-- ─────────────────────────────────────────────────────────────────────────────

alter table activity add column if not exists changes jsonb;
