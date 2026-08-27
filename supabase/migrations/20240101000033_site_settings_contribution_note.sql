-- ─────────────────────────────────────────────────────────────────────────────
-- The home screen's "you can edit this" line.
--
-- Every listing already carries Add / Edit / Report, but they only appear once
-- a visitor has expanded a specific card, in the smallest grey text on it — so
-- someone can browse the whole site and never learn that the directory is
-- theirs to correct. The one place that said so was the footer blurb, which
-- was desktop-only. This is that message moved to where everybody sees it:
-- directly under the home screen's search box.
--
-- Admin-editable like the rest of the on-page copy (name, tagline, hero title,
-- mission) rather than hardcoded, because the exact wording of an invitation
-- is the kind of thing that gets tuned repeatedly and shouldn't need a deploy.
-- Empty string hides the line entirely, which is the escape hatch for a
-- community that doesn't want it.
--
-- Defaults to '' rather than to the copy itself: SITE_SETTINGS_DEFAULTS in
-- src/lib/siteSettings.ts supplies the wording for a deployment with no row
-- yet, and duplicating a sentence between here and there is exactly how the
-- two drift apart. The backfill below is what gives existing rows the line.
-- ─────────────────────────────────────────────────────────────────────────────

alter table site_settings
  add column if not exists contribution_note text not null default '';

-- Existing deployments have a row already, so the column default alone would
-- leave them with the line switched off and no hint that it exists. Seeded
-- once, and only where nobody has set it — a re-run must not overwrite an
-- admin's own wording.
update site_settings
   set contribution_note = 'Community-maintained — anyone can add a place or suggest a fix.'
 where contribution_note = '';
