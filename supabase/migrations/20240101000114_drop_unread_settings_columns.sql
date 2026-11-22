-- Columns nothing on the site reads any more (Nov 22 2026, tracker item 53).
--
-- The admin clean-up of Oct 29 took these out of the admin and the code:
-- the header's tagline line, the computer home's Browse, Davening and Map
-- card headings (and the Shabbat card's, gone with board G5b, Nov 11), the
-- category and form card text colour, and a form's card photo. The columns
-- stayed so no data was dropped without the user's yes.
--
-- Run only after the code that stops writing site_settings.tagline has
-- deployed (taglineToWrite in src/lib/siteSettingsStore.ts): the column is
-- NOT NULL with no default, and the code before that writes it on every
-- settings save, so dropping it first breaks every save until the deploy.
--
-- What live held when read (Nov 22, read only), and is lost:
--   site_settings (1 row): tagline "Guide for residents, visitors, and
--     patients"; desktop_browse "Get started" / "What are you looking
--     for?"; desktop_davening "Today" / "Upcoming Davening"; desktop_map
--     "Discover nearby" / "Explore the Map".
--   category.card_text_color: 14 of 16 rows, colours like #ffffff.
--   form.card_image_url: both forms, an Unsplash photo each.
--   community.tagline: the communities' own copies of the same line.
--
-- Kept, because they are still read: category.card_image_url and
-- site_settings.desktop_map_image.

alter table site_settings
  drop column if exists tagline,
  drop column if exists desktop_browse_eyebrow,
  drop column if exists desktop_browse_heading,
  drop column if exists desktop_davening_eyebrow,
  drop column if exists desktop_davening_heading,
  drop column if exists desktop_map_eyebrow,
  drop column if exists desktop_map_heading,
  drop column if exists desktop_jewish_times_heading;

alter table community drop column if exists tagline;

alter table category drop column if exists card_text_color;

alter table "form"
  drop column if exists card_text_color,
  drop column if exists card_image_url;

insert into public.migration_ran (name) values ('20240101000114_drop_unread_settings_columns') on conflict (name) do nothing;
