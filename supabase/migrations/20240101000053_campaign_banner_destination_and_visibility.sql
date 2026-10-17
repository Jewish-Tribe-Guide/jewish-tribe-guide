-- ─────────────────────────────────────────────────────────────────────────────
-- Two follow-ups to campaign_banner (20240101000052), both from the same
-- design conversation: (1) the banner's own CTA can go to the category's
-- directory page or the map — some campaigns are map-first, some aren't, and
-- there's no reason to force one; (2) a category linked to a live campaign
-- should become visible even if it's otherwise admin-hidden (`active =
-- false`), so a dedicated seasonal category (e.g. Sukkahs) can stay
-- deliberately hidden the rest of the year without a second flag to keep in
-- sync with the campaign's own dates — see categoryStore.ts's listCategories
-- and campaignBanner.ts's activeCampaignCategoryIds for the actual logic;
-- nothing here is schema for that part, it's pure application code reading
-- the two tables together. Run in the Supabase SQL editor, after
-- campaign_banner.sql.
-- ─────────────────────────────────────────────────────────────────────────────

alter table campaign_banner add column if not exists destination text not null default 'map';
alter table campaign_banner drop constraint if exists campaign_banner_destination_check;
alter table campaign_banner add constraint campaign_banner_destination_check check (destination in ('list', 'map'));
