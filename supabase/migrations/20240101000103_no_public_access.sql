-- The public key reaches no table (Nov 20 2026, the health sweep).
--
-- The anon key ships to every visitor's browser (NEXT_PUBLIC_SUPABASE_ANON_KEY),
-- and these policies let it read straight from the database, past the site:
--
--   community       every column: admin_emails, notify_*_emails, and the
--                   preview_token that opens a hidden community
--   resource        every approved listing, hidden communities' included
--   subscriber      insert any row, past Turnstile and the rate limit
--   and the rest    categories, forms, settings, pages... of every community
--
-- Nothing in the site uses them. Every read and write goes through a server
-- route on the service-role key, which skips RLS; the browser uses the anon
-- key only to sign an admin in (supabase.auth), which no policy touches.
-- So each table keeps RLS on with no policy for anon or authenticated, and
-- reaching data means going through the site's own routes, with their
-- checks (hidden communities, admins, Turnstile, limits).
--
-- Supabase's advisor will list these tables as "RLS enabled, no policy".
-- That is the intent here, not an omission.
-- src/test/noPublicPolicies.test.ts fails if a later migration adds one back.
--
-- Run in the Supabase SQL editor, dev then live. Safe to run twice.

drop policy if exists "public reads communities" on community;
drop policy if exists "public reads approved resources" on resource;
drop policy if exists "public reads tags" on tag;
drop policy if exists "public reads approved resource_tags" on resource_tag;
drop policy if exists "public reads categories" on category;
drop policy if exists "public reads forms" on form;
drop policy if exists "public reads home sections" on home_section;
drop policy if exists "public reads hospitals" on hospital;
drop policy if exists "public reads pages" on page;
drop policy if exists "public reads site settings" on site_settings;
drop policy if exists "public reads campaign banners" on campaign_banner;
drop policy if exists "public can subscribe" on subscriber;
