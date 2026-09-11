-- ─────────────────────────────────────────────────────────────────────────────
-- A reusable seasonal promotion: an admin-managed banner that points at an
-- existing category and is visible only between a start and end date — e.g.
-- a "Sukkah Map" every Sukkot, reusable for the next one-off campaign
-- without touching code. Run in the Supabase SQL editor.
--
-- Visibility is the date range, full stop — no separate on/off flag. Outside
-- [start_date, end_date] the banner (and the map's own highlighted chip for
-- its category) disappear completely; the category and its listings are
-- untouched either way, so they stay editable year-round.
--
-- community_id has NO default, unlike the older content tables (see
-- communities.sql's own comment on why that default — convenient while only
-- one community existed — is a liability now that a second one ('ues')
-- actually does: a write that forgets to scope itself would silently land on
-- 'philly' instead of failing loudly. This table is new enough to just not
-- carry that risk forward.
--
-- category_id is a plain text column, not a declared foreign key — same
-- convention every other community_id/category_id pair in this schema
-- already uses (see category's own composite primary key below).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists campaign_banner (
  id           text not null,
  community_id text not null,
  category_id  text not null,
  title        text not null,
  subtitle     text not null default '',
  start_date   date not null,
  end_date     date not null,
  created_at   timestamptz not null default now(),
  primary key (community_id, id)
);

create index if not exists campaign_banner_dates_idx
  on campaign_banner (community_id, start_date, end_date);

-- Public reference data — the home screen and map read it directly (no
-- auth), same as `category` and `home_section`.
alter table campaign_banner enable row level security;
create policy "public reads campaign banners" on campaign_banner for select using (true);
