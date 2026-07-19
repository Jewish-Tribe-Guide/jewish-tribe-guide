-- ─────────────────────────────────────────────────────────────────────────────
-- Site settings (run in Supabase SQL editor, after forms.sql).
--
-- A single-row table for the admin-editable slice of on-page branding text —
-- the site name/tagline (header), home screen heading, and mission (hero
-- subtitle + footer blurb). Everything else in community.config.ts (region,
-- timezone, feature flags, theme color, the <title>/meta description/PWA
-- manifest) stays code-only; see src/lib/siteSettings.ts.
--
-- No seed script needed: getSiteSettings() falls back to the community.config
-- defaults when this table is empty, and the admin's first Save creates the
-- row via upsert.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists site_settings (
  id          text primary key default 'default',
  name        text not null,
  tagline     text not null,
  hero_title  text not null,
  mission     text not null,
  updated_at  timestamptz not null default now()
);

-- Site settings are public reference data — the live header/hero/footer read
-- them directly (no auth), same as `category` and `form`.
alter table site_settings enable row level security;
create policy "public reads site settings" on site_settings for select using (true);
