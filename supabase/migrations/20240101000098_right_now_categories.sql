-- What Right now answers on a weekday (board V1, Nov 15 2026): the admin
-- picks, from the categories that can answer "now" (open now, the next
-- minyan, the eruv), at most two, in order. Category ids, as jsonb.
--
-- Null (and a database without this column) is the ready-made choice: the
-- first two categories whose places say their hours, as before.
--
-- Run in the Supabase SQL editor. Without it the site works as before,
-- every other setting still saves, and only changing Right now's choice
-- says it isn't set up yet.

alter table public.site_settings add column if not exists right_now_categories jsonb;
