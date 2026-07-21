-- ─────────────────────────────────────────────────────────────────────────────
-- Adds an optional site logo to site_settings (run in Supabase SQL editor,
-- after site_settings_feedback.sql). Admin-set via a pasted image URL in the
-- Site tab — no upload/storage involved, same pattern as category card images.
-- Null (the default) keeps the built-in Star of David mark in the header.
-- ─────────────────────────────────────────────────────────────────────────────

alter table site_settings add column if not exists logo_url text;
