-- Right now as a card on the computer home (board U1, Nov 14 2026): what's
-- open on a weekday, the candles card and Shabbos shopping on Friday, the
-- Shabbos card on Shabbos, the same answers the phone home gives. An admin
-- adds it in Home page › cards like any other; the Next minyan card
-- ('davening') stays one of them, for a community that wants it.
--
-- Only widens the kinds a row may have. A community with no card rows at
-- all gets Right now in its defaults (Landing.tsx); one with rows of its
-- own gets it once an admin adds it.
--
-- Run in the Supabase SQL editor. Without it, saving the cards with Right
-- now in them is refused; everything else works.

alter table home_section drop constraint if exists home_section_kind_check;
alter table home_section add constraint home_section_kind_check
  check (kind in ('section', 'featured', 'map', 'zmanim', 'browse', 'shabbat', 'davening', 'listings', 'subscribe', 'jewishTimes', 'suggest', 'rightNow'));
