-- ─────────────────────────────────────────────────
-- Read now for email (Nov 1 2026, board SetupSteps14).
--
-- The Gmail script can also be deployed as a web app, so an admin adding a
-- place can see that address's latest email then and there, instead of
-- coming back after the hourly run. This keeps the link the admin pasted.
--
--   web_app_url  the script's web app link; null: Read now is off, and the
--                hourly check carries on regardless
--
-- Run in the Supabase SQL editor. Without it, the Newsletters page works as
-- before and Read now for email stays off.
-- ─────────────────────────────────────────────────

alter table public.newsletter_setup add column if not exists web_app_url text;
