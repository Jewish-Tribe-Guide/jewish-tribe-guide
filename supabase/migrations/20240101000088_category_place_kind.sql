-- What kind of place a category holds (Oct 29 2026; the admin redesign's
-- brief, question 8).
--
--   place_kind   'shuls' | 'food' | 'groceries' | 'mikvahs' | 'hotels' |
--                'hospitals' | 'plain', or null. The icon, the hidden search
--                words and the schema.org type follow it (src/lib/
--                placeKinds.ts). Null takes the kind from the slug, so every
--                category saved before this keeps what it had.
--
-- Run in the Supabase SQL editor. The site works without it: every
-- category's kind comes from its slug, and only picking a kind its slug
-- doesn't imply (in Site → Category pages) needs the column.

alter table public.category add column if not exists place_kind text
  check (place_kind is null or place_kind in ('shuls', 'food', 'groceries', 'mikvahs', 'hotels', 'hospitals', 'plain'));
