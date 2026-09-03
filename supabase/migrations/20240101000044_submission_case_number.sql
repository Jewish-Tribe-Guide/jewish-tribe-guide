-- ─────────────────────────────────────────────────────────────────────────────
-- A plain, human-friendly number for each submission — what a moderation
-- email leads with so an admin can tell at a glance that two DIFFERENT
-- emails ("New listing suggestion — X" and later "Y approved — X") are
-- about the same submission. `id` is a UUID; asking someone to eyeball-
-- match "a1b2c3" against another "a1b2c3" across two inbox rows is exactly
-- the friction this exists to remove — plain digits are what people
-- actually compare at a glance.
--
-- bigserial, not a value computed from `id`: a real auto-incrementing
-- sequence, so every new submission gets the next number regardless of
-- which community it's for (a single shared sequence, same as `id` itself
-- isn't per-community). Existing rows get backfilled with sequential
-- numbers by Postgres itself as part of adding the column — not
-- guaranteed to match created_at order for rows that already exist, but
-- every submission from here on gets one in true creation order.
-- ─────────────────────────────────────────────────────────────────────────────

alter table submission add column if not exists case_number bigserial;
