-- What the tests need that the seed's real content doesn't have. Loaded
-- after the seed by scripts/test-db.mjs (and so in every CI job), never on
-- a real project: each is something a community can set up but none of the
-- seeded ones has, so the test of it would only ever skip.
-- src/test/e2eSkips.test.ts is why: on the seed, a test that needs data
-- fails when it's missing (e2e/helpers.ts's needs()).

-- A second community visitors can open: caching.spec.ts's "each community
-- gets its own cache entry". The seed's other two are hidden.
update community set visible = true where slug = 'ues';

-- A category whose list is in closed groups (a pick-list field):
-- listing-detail.spec.ts's "a group opened … closes again".
update category set group_by = '{"kind": "field", "key": "d"}' where community_id = 'philly' and id = 'school';

-- A night the nightly jobs validated, yesterday at 1 AM in Philadelphia:
-- What changed's "Validated" row and its page (validated-nights.spec.ts).
-- The seed keeps no job runs.
insert into job_run (job, started_at, finished_at, ok, summary, community_id, kinds)
select
  'sync-hours',
  (date_trunc('day', now() at time zone 'America/New_York') - interval '1 day' + interval '1 hour') at time zone 'America/New_York',
  (date_trunc('day', now() at time zone 'America/New_York') - interval '1 day' + interval '1 hour 5 minutes') at time zone 'America/New_York',
  true,
  'Checked against Google.',
  'philly',
  jsonb_build_object('philly', jsonb_build_object('google', jsonb_build_object('of', count(*), 'read', count(*), 'validated', jsonb_agg(id))))
from (select id from resource where community_id = 'philly' and status = 'approved' order by id limit 3) r;
