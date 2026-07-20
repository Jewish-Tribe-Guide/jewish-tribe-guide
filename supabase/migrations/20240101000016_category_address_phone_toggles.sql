-- ─────────────────────────────────────────────────────────────────────────────
-- Split the "community" flag into independent address/phone toggles (run in
-- Supabase SQL editor, after category_community_flag.sql).
--
-- The single `community` boolean (added in the previous migration) hid
-- address, phone, distance, and the Map button all together. That's more
-- rigid than needed — a category might want a phone number but no address
-- (or vice versa) — so it's replaced with two independent columns, both
-- defaulting to true (every existing category keeps address + phone). Any
-- category previously marked community-wide (address AND phone both hidden)
-- gets both flipped off. The Map button now simply has no effect when
-- has_address is false (see src/lib/categories.ts / GenericDirectory.tsx),
-- rather than being tied to a separate flag.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists has_address boolean not null default true;
alter table category add column if not exists has_phone boolean not null default true;

update category set has_address = false, has_phone = false where community = true;

alter table category drop column if exists community;
