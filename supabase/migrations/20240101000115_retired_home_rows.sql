-- Home rows no screen draws any more, taken out, and the kinds refused from
-- now on (Nov 25 2026, with the starter pack).
--
-- 'zmanim' and 'shabbat' (the old paired cards), 'featured' ("Popular
-- right now") and 'listings' (the "Kept by the Community" card) were
-- retired one by one (see src/lib/homeSections.ts). Landing.tsx draws
-- nothing for a leftover row and the admin's Home page cards leave them out,
-- so the rows did nothing but wait to be copied into the next community.
--
-- What each database held when read (Nov 25, read only), and is removed:
--   live: philly "Update Listings Card" (listings), "Prayer & Shabbat
--     Times" (zmanim), "Popular right now" (featured).
--   dev:  "Prayer & Shabbat Times" (zmanim) in philly, baltimore and
--     e2e-writes.
--
-- Safe before or after the deploy: no code reads or writes these kinds.

delete from home_section where kind in ('zmanim', 'shabbat', 'featured', 'listings');

alter table home_section drop constraint if exists home_section_kind_check;
alter table home_section add constraint home_section_kind_check
  check (kind in ('section', 'map', 'browse', 'davening', 'subscribe', 'jewishTimes', 'suggest', 'rightNow'));

insert into public.migration_ran (name) values ('20240101000115_retired_home_rows') on conflict (name) do nothing;
