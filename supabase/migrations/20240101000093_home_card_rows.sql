-- ─────────────────────────────────────────────────────────────────────────────
-- Home card rows (Nov 4 2026; drawn as artifact 8HpeQANzsQyGbyHVPsXrc5): the
-- computer home's cards set in rows by dragging, up to three a row, with no
-- width setting. Suggest a Listing becomes a card of its own.
--
--   shares_row   true: this card sits in the row of the card before it (by
--                sort_order, among the cards). Landing.tsx caps a row at
--                three and keeps Categories alone (cardRows in
--                homeSections.ts), so a bad value can't break the page.
--   kind         gains 'suggest' (Suggest a Listing).
--
-- `width` stays, unread, so the code before this deploy keeps working. It
-- is safe to run before or after that deploy: the code before it ignores
-- shares_row and renders nothing for a 'suggest' row, and keeps its own
-- Suggest a Listing.
--
-- Keeps each home page as it looks today:
--   - Davening Times, Kept by the Community and Suggest a Listing were one
--     row, drawn at whichever of the first two came first. They're put
--     together there, in that order, Suggest a Listing added.
--   - Two half-width cards next to each other shared a row; the second now
--     shares the first's.
-- Run once per database. Running it again changes nothing.
-- ─────────────────────────────────────────────────────────────────────────────

-- card_ids is jsonb: this file's first version wrote '{}', jsonb's empty
-- object, which broke every page build. Rerunning it puts that right.
update home_section set card_ids = '[]'::jsonb where kind = 'suggest' and jsonb_typeof(card_ids) <> 'array';

alter table home_section add column if not exists shares_row boolean not null default false;

alter table home_section drop constraint if exists home_section_kind_check;
alter table home_section add constraint home_section_kind_check
  check (kind in ('section', 'featured', 'map', 'zmanim', 'browse', 'shabbat', 'davening', 'listings', 'subscribe', 'jewishTimes', 'suggest'));

do $$
declare
  c record;
  r record;
  first_order int;
  prev_half boolean;
begin
  -- The three-card row, for each community without a Suggest a Listing yet.
  for c in
    select distinct community_id from home_section
    where kind in ('davening', 'listings')
      and community_id not in (select community_id from home_section where kind = 'suggest')
  loop
    -- Room for the three side by side; the order stays the same.
    update home_section set sort_order = sort_order * 10 where community_id = c.community_id;
    select min(sort_order) into first_order from home_section
      where community_id = c.community_id and kind in ('davening', 'listings');
    update home_section set sort_order = first_order, shares_row = false
      where community_id = c.community_id and kind = 'davening';
    update home_section set sort_order = first_order + 1,
      shares_row = exists (select 1 from home_section where community_id = c.community_id and kind = 'davening')
      where community_id = c.community_id and kind = 'listings';
    insert into home_section (community_id, id, kind, title, sort_order, card_ids, shares_row)
      values (c.community_id, 'suggest', 'suggest', 'Suggest a Listing Card', first_order + 2, '[]'::jsonb, true)
      on conflict (community_id, id) do nothing;
  end loop;

  -- Two half-width cards side by side, walked the way the home page did:
  -- in order, a pair taking both cards. Davening Times and Kept by the
  -- Community had their own row and Categories never paired, so they only
  -- break a pair. Retired kinds rendered nothing and are skipped.
  for c in select distinct community_id from home_section where width = 'half' loop
    prev_half := false;
    for r in
      select id, kind, width from home_section
      where community_id = c.community_id and kind in ('browse', 'davening', 'listings', 'subscribe', 'jewishTimes')
      order by sort_order, id
    loop
      if r.kind in ('subscribe', 'jewishTimes') and r.width = 'half' then
        if prev_half then
          update home_section set shares_row = true where community_id = c.community_id and id = r.id;
          prev_half := false;
        else
          prev_half := true;
        end if;
      else
        prev_half := false;
      end if;
    end loop;
  end loop;
end $$;
