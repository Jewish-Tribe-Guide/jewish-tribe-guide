-- ─────────────────────────────────────────────────────────────────────────────
-- Records WHICH admin approved or rejected a submission — nothing did before
-- this. reviewed_at already recorded when, but with several admins per
-- community now (admin_emails), "who approved this" had no answer except
-- asking around. The acting admin's own verified email (from
-- getAdminUserForCommunity, the same token every moderation PATCH already
-- authenticates with) is written alongside reviewed_at, not derived after
-- the fact — there's no reliable way to reconstruct it later.
--
-- Nullable, with no backfill: every submission reviewed before this migration
-- keeps a real gap here rather than a fabricated guess.
-- ─────────────────────────────────────────────────────────────────────────────

alter table submission add column if not exists reviewed_by text;
