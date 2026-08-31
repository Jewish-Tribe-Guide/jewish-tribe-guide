-- ─────────────────────────────────────────────────────────────────────────────
-- A second community: Upper East Side (Manhattan) — dev/preview only.
--
-- Everything this needs already exists: 20240101000027_communities.sql built
-- the `community` table and put `community_id` on every content table. This
-- migration is just the second row.
--
-- DO NOT RUN THIS AGAINST PRODUCTION. It's for standing up a second
-- community in a local/dev/preview Supabase project to see what multi-
-- community actually looks like end to end — see AGENTS.md's "Never write to
-- production without being told to, every time". Applying it to the real
-- database is a production write like any other and needs its own explicit
-- go-ahead in the same exchange.
--
-- Not default (`is_default: false`) — philly stays the community "/" resolves
-- to and the one a bare, cookie-less visit lands on. This row existing is
-- what makes the header switcher appear at all (see communityContext.tsx's
-- canSwitch) and what /ues resolves to.
--
-- Starts with no categories/forms/site_settings/home_sections rows of its
-- own — every content store falls back sanely on an empty read (see
-- loadCommunityContent.ts), so the site renders immediately, just empty.
-- Seed it the same way any new community would be seeded — npm run seed
-- (pointed at this community) or the admin console once the switcher can
-- reach it.
-- ─────────────────────────────────────────────────────────────────────────────

insert into community (
  slug, name, short_name, tagline, mission, manifest_description,
  region, timezone, map_center, theme_color, background_color, sort_order, is_default
) values (
  'ues',
  'Upper East Side Jewish Community',
  'UES Guide',
  'Guide for residents and visitors',
  'A guide to Jewish life on the Upper East Side — synagogues, kosher food, and community resources.',
  'Connecting residents and visitors with Upper East Side Jewish community resources',
  'Upper East Side',
  'America/New_York',
  '{"lat":40.7736,"lng":-73.9566}'::jsonb,
  '#7c3aed',
  '#f8fafc',
  20,
  false
) on conflict (slug) do nothing;
