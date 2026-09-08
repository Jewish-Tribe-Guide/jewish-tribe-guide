-- ─────────────────────────────────────────────────────────────────────────────
-- Adds side-by-side layout for the desktop home screen's built-in cards
-- (see homeSections.ts's own doc). 'full' (the default — every existing row
-- reads as this) is its own row, edge to edge; 'half' pairs with a
-- neighboring 'half' card into one 2-column row — see Landing.tsx's own
-- row-pairing walk for exactly how two 'half' cards land next to each other,
-- and what happens when one doesn't have a pair. Only meaningful for a
-- built-in card (kind <> 'section'); ignored for a plain named section,
-- which has its own layout (the mobile grid / desktop mega-menu). Run in
-- the Supabase SQL editor, after home_section_kind_split_cards.sql.
-- ─────────────────────────────────────────────────────────────────────────────

alter table home_section add column if not exists width text not null default 'full';
alter table home_section drop constraint if exists home_section_width_check;
alter table home_section add constraint home_section_width_check check (width in ('full', 'half'));
