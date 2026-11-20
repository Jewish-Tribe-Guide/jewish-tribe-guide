-- Indexes for the reads every page and the admin make, as communities and
-- their history grow (Nov 20 2026, the speed and scale sweep).
--
-- Each table had single-column indexes (community_id, status, category)
-- from 001-027, so a read naming all three used one and filtered the rest
-- row by row.
--
--   resource (community_id, status, category)
--       every category page and the site's listings: a community's
--       approved places, often of one category (resourceStore.ts).
--   submission (community_id, status, created_at desc)
--       To do: a community's pending changes, newest first.
--   submission (community_id, status, reviewed_at desc, id desc)
--       History: a community's approved or rejected changes, fifty at a
--       time, newest decided first (listSubmissionsByStatus).
--   vote (voter_token)
--       a browser's own votes (getVotedResourceIds). The primary key is
--       (resource_id, voter_token), which can't find a token alone.
--
-- Run in the Supabase SQL editor. Nothing depends on it: the reads are the
-- same with or without, only quicker. The tables are small enough (a few
-- thousand rows) that building each takes well under a second.

create index if not exists resource_community_status_category_idx
  on public.resource (community_id, status, category);

create index if not exists submission_community_status_created_idx
  on public.submission (community_id, status, created_at desc);

create index if not exists submission_community_status_reviewed_idx
  on public.submission (community_id, status, reviewed_at desc, id desc);

create index if not exists vote_voter_token_idx
  on public.vote (voter_token);
