-- Suggesting a fix to an eruv's listing (Oct 13 2026).
--
-- Anyone can suggest a change to an eruv's "Where it goes", website, hotline
-- or email alerts link, from its listing. It goes to the moderation queue as
-- a listing's edit does (target_type 'eruv', operation 'update') and shows
-- once an admin approves it. The eruv's id is in the payload (`eruvId`):
-- target_id is a uuid, and an eruv's id is text ('center-city').
--
-- Until this is run, sending one fails with "Could not save your
-- submission"; nothing else changes.

alter table submission drop constraint if exists submission_target_type_check;
alter table submission add constraint submission_target_type_check
  check (target_type in ('listing', 'tag', 'category', 'eruv'));
