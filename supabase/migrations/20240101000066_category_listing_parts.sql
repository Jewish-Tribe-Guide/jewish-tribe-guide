-- ─────────────────────────────────────────────────────────────────────────────
-- What an admin adds to each of a category's opened listings — see
-- CategoryConfig.listingParts and src/lib/listingParts.ts. Hospitals' use of
-- it: "Who to call first" as the main thing, a This Shabbos card with the
-- eruv and kosher food inside, and Set as location among the buttons.
--
--   {"main": {"title": "Who to call first", "fields": ["who_to_call", "who_to_call_phone"]},
--    "shabbos": {"fields": ["eruv", "kosher_food_inside"]}, "setLocation": true}
--
-- Null means none of them, which is how every category behaves until an
-- admin chooses one in the category editor. The code reads a category the
-- same way whether or not this column exists yet; only saving needs it.
--
-- walk_list (061) needs nothing new: it now holds an array of lists, and the
-- code still reads the single list stored before.
-- ─────────────────────────────────────────────────────────────────────────────

alter table category add column if not exists listing_parts jsonb;
