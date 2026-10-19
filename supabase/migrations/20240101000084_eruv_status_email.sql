-- An eruv's status by email (Oct 19 2026).
--
-- Northeast and Elkins Park post no status page: they announce up and down
-- by email (Northeast on a groups.io list). The guide's Gmail is subscribed,
-- and the Gmail script that sends shul newsletters sends these too
-- (src/lib/eruvEmail.ts). Each one is read by code for up or down and shows
-- at once, for the Shabbos of the week it was sent.
--
--   status_email       the address its status emails come from, lower
--                      case; set on the admin Eruvim tab. Read only for an
--                      eruv with no status_url. Never shown to the public.
--   status_email_kept  the last email from it the guide couldn't make out
--                      ({ messageId, subject, sentAt, text, words }), for
--                      an admin to read and say up, down or neither
--
-- Run in the Supabase SQL editor. The site works without it: every eruv is
-- read from its page as before, and the Eruvim tab can't save an address.

alter table public.eruv add column if not exists status_email text;
alter table public.eruv add column if not exists status_email_kept jsonb;
