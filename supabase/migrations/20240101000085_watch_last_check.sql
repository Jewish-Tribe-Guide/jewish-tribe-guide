-- What a watch's last full check found (Oct 20 2026).
--
-- "Check now" on the admin Watches tab is the full check: a shul's,
-- mikvah's or menu page is read by the AI whether or not it changed, and
-- a list (Keystone-K, Mekor Habracha, Refuah) is compared with the guide.
-- The row shows what it read and whether that agrees with the listing,
-- and keeps it until the next check (src/lib/watches.ts, WatchCheck).
--
--   last_check   { at, what, from, result, read, more?, differences,
--                  queue, note?, list? }: what it read (short lines) and
--                from where, "agrees" / "differs" / "nothing" /
--                "unreadable", each difference and whether it went to
--                the queue; for a list, its counts
--
-- Run in the Supabase SQL editor. The site works without it: watches run
-- and file as before, and a check's result shows only until the tab is
-- reloaded.

alter table public.watch add column if not exists last_check jsonb;
