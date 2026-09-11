-- ─────────────────────────────────────────────────────────────────────────────
-- Adds an optional second photo for a category: the desktop directory
-- header's wide, short banner (see src/components/resources/CategoryBandFrame.tsx),
-- as distinct from card_image_url (the home-screen card's roughly-4:3 tile).
-- The two need different crops of what's often the same photo — a crop tight
-- enough to read well as a 4:3 tile usually cuts off too much of a wide
-- banner and vice versa — so this is its own field with its own upload/crop
-- step in the category editor, not a second use of card_image_url.
--
-- Admin-uploaded (see /api/admin/categories/band), same as icon_image_url —
-- unlike card_image_url, which is a pasted URL with no crop step. Null (the
-- default) falls back to card_image_url, then to the flat color wash — see
-- bandImageFor in src/lib/categories.ts.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists card_band_image_url text;
