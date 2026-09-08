-- ─────────────────────────────────────────────────────────────────────────────
-- Widens home_section.kind again: 'zmanim' (Davening Times + the community
-- card, paired) and 'shabbat' (Shabbat Times + Stay in the Loop, also
-- paired) each split into two fully independent, individually reorderable
-- cards — 'davening'/'listings' and 'subscribe'/'jewishTimes'. 'featured'
-- ("Popular right now") is dropped from the application (no admin control
-- was ever built for it, and it duplicated the flat "Browse everything"
-- grid), but stays a legal value here rather than being removed — same
-- reasoning as every prior widening of this constraint: DDL here only ever
-- adds allowed values, never removes one, so an existing row with an old
-- kind doesn't fail a future constraint check. Run in the Supabase SQL
-- editor, after home_section_kind_browse_shabbat.sql.
--
-- No backfill: an existing row with kind 'zmanim'/'shabbat'/'featured'
-- simply has no branch in Landing.tsx's ordered walk any more and renders
-- nothing — reseed (see seed-home-blocks.mjs) or remove it by hand via the
-- admin's own Home screen cards list.
-- ─────────────────────────────────────────────────────────────────────────────

alter table home_section drop constraint if exists home_section_kind_check;
alter table home_section add constraint home_section_kind_check
  check (kind in ('section', 'featured', 'map', 'zmanim', 'browse', 'shabbat', 'davening', 'listings', 'subscribe', 'jewishTimes'));
