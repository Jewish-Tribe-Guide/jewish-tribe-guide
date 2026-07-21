-- ─────────────────────────────────────────────────────────────────────────────
-- Data-driven home-screen sections (run in Supabase SQL editor, after
-- site_settings_logo.sql).
--
-- Moves the home-screen grouping (previously the hardcoded HOME_SECTIONS
-- constant in src/components/home/sections.tsx) into the database, so an admin
-- can rename sections, add new ones, and choose which cards (category ids, or
-- fixed ids like 'support'/'map'/'medical') belong to each — all from the
-- Sections tab in /admin.
--
-- `card_ids` is an ordered array of CardDef ids; a card whose id isn't listed
-- in any section falls into a trailing "More" section on the home page rather
-- than disappearing.
--
-- After running this DDL, seed the five starter sections (matching the old
-- hardcoded grouping) with:
--   node --env-file=.env.local scripts/seed-home-sections.mjs
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists home_section (
  id         text primary key,
  title      text not null,
  sort_order int not null default 100,
  card_ids   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists home_section_sort_idx on home_section (sort_order);

-- Home sections are public reference data — the landing page reads them
-- directly (no auth), same as `category` and `site_settings`.
alter table home_section enable row level security;
create policy "public reads home sections" on home_section for select using (true);
