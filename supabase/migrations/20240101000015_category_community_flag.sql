-- ─────────────────────────────────────────────────────────────────────────────
-- Category "community-wide" flag as a real column (run in Supabase SQL editor,
-- after category_kind.sql).
--
-- Previously `community` (no address/hospital anchor — e.g. WhatsApp groups)
-- was hardcoded to a single id ('whatsapp') in COMMUNITY_CATEGORY_IDS
-- (src/lib/categories.ts), so it could never be set from the admin category
-- editor. This promotes it to a column so any category can be marked
-- community-wide from the UI. See categoryStore.ts / CategoryManager.tsx.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists community boolean not null default false;

update category set community = true where id = 'whatsapp';
