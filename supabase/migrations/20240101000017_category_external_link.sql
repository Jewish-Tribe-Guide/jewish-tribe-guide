-- ─────────────────────────────────────────────────────────────────────────────
-- Category-level external link (run in Supabase SQL editor, after
-- category_address_phone_toggles.sql).
--
-- A link shown as its own button in a category's directory header, next to
-- Map/Add — not tied to any listing. First use: a "Other Mikvahs" button on
-- the Mikvah category pointing at mikvah.org's broader directory, since not
-- every mikvah in the area is curated here. See CategoryConfig.externalLink
-- in src/lib/categories.ts.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists external_link_label text;
alter table category add column if not exists external_link_url text;
