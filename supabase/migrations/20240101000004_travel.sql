-- ─────────────────────────────────────────────────────────────────────────────
-- Travel times (run in Supabase SQL editor, after schema.sql).
--
-- Replaces the old straight-line `distance` (miles) with real driving/walking
-- times per hospital, computed via Google's Distance Matrix API. Shape:
--   { "<hospitalId>": { "drive": <minutes>, "walk": <minutes> }, … }
-- Computed at submission-approval time (see submissionStore.ts) and backfilled
-- for existing listings via scripts/backfill-travel-times.mjs.
-- ─────────────────────────────────────────────────────────────────────────────

alter table resource add column if not exists travel jsonb;
