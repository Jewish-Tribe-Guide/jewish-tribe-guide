-- ─────────────────────────────────────────────────────────────────────────────
-- Adds an optional photo background + matching text color for a category's
-- home-screen card (run in Supabase SQL editor, after
-- category_kind_eruv_medical.sql). Both are admin-set via a pasted image URL
-- and a color picker in the category editor — no upload/storage involved.
-- Null (the default) keeps today's flat-tint + icon look.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists card_image_url text;
alter table category add column if not exists card_text_color text;
