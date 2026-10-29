-- Why a suggestion was left out (Oct 29 2026; the admin redesign's step 5:
-- History shows the reasons).
--
--   review_reason   what the admin typed when leaving it out, the same words
--                   the submitter's email carries. Null when none was given,
--                   and for everything decided before this.
--
-- Run in the Supabase SQL editor. The site works without it: leaving a
-- suggestion out still works and still emails the reason; History just has
-- none to show.

alter table public.submission add column if not exists review_reason text;
