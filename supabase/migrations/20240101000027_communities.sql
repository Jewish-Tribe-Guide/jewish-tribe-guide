-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-community support (run in the Supabase SQL editor, after
-- site_settings_mobile_tabs.sql).
--
-- One database, one row per community, `community_id` on every content table —
-- rather than a database per community. Two reasons that's the right shape
-- here: a merged cross-community map stays a plain query instead of app-level
-- fan-out across N connections, and adding a community stays an INSERT instead
-- of provisioning a whole Supabase project with its own migrations, secrets and
-- bill. Isolation is by WHERE clause, which is safe here because every read and
-- write already funnels through the ~10 modules in src/lib/*Store.ts.
--
-- Nothing about the site changes when only one community exists: everything is
-- backfilled to 'philly', and the UI hides the switcher until a second row
-- shows up.
--
-- SLUG COLLISIONS. category/form/home_section are keyed by slug ('grocery',
-- 'support'), and two communities will both want those. Their primary keys
-- become composite (community_id, id); `tag.slug`'s unique constraint gets the
-- same treatment. Nothing references them by foreign key — resource.category is
-- a plain text column — so this doesn't cascade.
--
-- ON THE DEFAULT. community_id defaults to 'philly' so that any insert path
-- missed during the rollout keeps working instead of erroring on a live site.
-- That's a deliberate trade: while Philly is the only community a misrouted
-- write is a no-op, but once a second community exists this default turns a
-- missed scope into a silent misfile. DROP IT at that point:
--   alter table resource alter column community_id drop default;   -- etc.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── The communities themselves ───────────────────────────────────────────────
-- Mirrors src/community.config.ts, which stays as the bootstrap for a fresh
-- install; once a row exists here it's the source of truth.
create table if not exists community (
  slug                 text primary key,      -- 'philly', 'baltimore'
  name                 text not null,
  short_name           text not null default '',
  tagline              text not null default '',
  mission              text not null default '',
  manifest_description text not null default '',
  region               text not null default '',
  timezone             text not null default 'America/New_York',
  map_center           jsonb not null default '{"lat":0,"lng":0}'::jsonb,
  theme_color          text not null default '#1d4ed8',
  background_color     text not null default '#f8fafc',
  -- Optional modules + UI capability toggles, same shapes as community.config.ts.
  features             jsonb not null default '{}'::jsonb,
  ui                   jsonb not null default '{}'::jsonb,
  sort_order           int not null default 100,
  -- The community served when the visitor hasn't chosen one. Exactly one row
  -- should have this set; the partial unique index below enforces it.
  is_default           boolean not null default false,
  created_at           timestamptz not null default now()
);

create unique index if not exists community_single_default_idx
  on community (is_default) where is_default;

-- Public reference data — the header's switcher reads it unauthenticated, same
-- as `category`, `home_section`, and `site_settings`. Reads are open; every
-- write still goes through a server route on the service-role key, which
-- bypasses RLS. Without this Supabase (rightly) warns that a table with no
-- policy is reachable by the anon key.
alter table community enable row level security;
drop policy if exists "public reads communities" on community;
create policy "public reads communities" on community for select using (true);

insert into community (
  slug, name, short_name, tagline, mission, manifest_description,
  region, timezone, map_center, theme_color, background_color, sort_order, is_default
) values (
  'philly',
  'Philadelphia Jewish Community',
  'PJC',
  'Guide for residents, visitors, and patients',
  'A guide to Jewish Philadelphia — community resources for residents, visitors, and hospital patients.',
  'Connecting patients, families, and neighbors with Philadelphia''s Jewish community resources',
  'Philadelphia',
  'America/New_York',
  '{"lat":39.9526,"lng":-75.1652}'::jsonb,
  '#1d4ed8',
  '#f8fafc',
  10,
  true
) on conflict (slug) do nothing;

-- ── community_id on every content table ──────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'resource', 'category', 'form', 'home_section', 'site_settings',
    'submission', 'form_response', 'hospital', 'tag'
  ] loop
    if to_regclass(t) is not null then
      execute format('alter table %I add column if not exists community_id text', t);
      execute format('update %I set community_id = ''philly'' where community_id is null', t);
      execute format('alter table %I alter column community_id set default ''philly''', t);
      execute format('alter table %I alter column community_id set not null', t);
      execute format('create index if not exists %I on %I (community_id)', t || '_community_idx', t);
    end if;
  end loop;
end $$;

-- ── Composite keys for the slug-keyed tables ─────────────────────────────────
-- Same slug in two communities has to be two different rows.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'category_pkey') then
    alter table category drop constraint category_pkey;
    alter table category add primary key (community_id, id);
  end if;

  if exists (select 1 from pg_constraint where conname = 'form_pkey') then
    alter table form drop constraint form_pkey;
    alter table form add primary key (community_id, id);
  end if;

  if exists (select 1 from pg_constraint where conname = 'home_section_pkey') then
    alter table home_section drop constraint home_section_pkey;
    alter table home_section add primary key (community_id, id);
  end if;

  -- site_settings held a single row keyed 'default'; it's now one row per
  -- community, so the community IS the key.
  if exists (select 1 from pg_constraint where conname = 'site_settings_pkey') then
    alter table site_settings drop constraint site_settings_pkey;
    alter table site_settings add primary key (community_id);
  end if;

  -- tag.slug was globally unique; make it unique per community instead.
  if exists (select 1 from pg_constraint where conname = 'tag_slug_key') then
    alter table tag drop constraint tag_slug_key;
    alter table tag add constraint tag_community_slug_key unique (community_id, slug);
  end if;
end $$;
