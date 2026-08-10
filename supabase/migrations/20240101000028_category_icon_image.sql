-- ─────────────────────────────────────────────────────────────────────────────
-- Adds an optional uploaded image as an alternative to a category's emoji
-- icon (run in Supabase SQL editor, after category_card_image.sql). Set via
-- the admin's category editor — paste a URL, drag/drop, browse, or (on
-- mobile) take a photo — uploaded to the same storage bucket the site logo
-- uses (see /api/admin/categories/icon). Null (the default) keeps today's
-- emoji-in-a-tinted-circle look; `icon` itself is kept either way as the
-- fallback if the image fails to load or is later cleared.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists icon_image_url text;
