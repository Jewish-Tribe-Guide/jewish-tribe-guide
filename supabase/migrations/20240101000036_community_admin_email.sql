-- ─────────────────────────────────────────────────────────────────────────────
-- A per-community admin-email field — captured, not yet enforced.
--
-- The "New Community" creation flow (src/lib/communityStore.ts's
-- createCommunity) collects this so it doesn't have to be re-gathered later,
-- but nothing reads it yet: admin auth still runs on the single global
-- ADMIN_EMAILS allowlist (src/lib/adminAuth.ts), the same as every other
-- community. Wiring per-community admin auth is real, separate work — see
-- the memory note on this being the unsolved security boundary before this
-- app hosts two real, differently-staffed communities.
-- ─────────────────────────────────────────────────────────────────────────────

alter table community add column if not exists admin_email text;
