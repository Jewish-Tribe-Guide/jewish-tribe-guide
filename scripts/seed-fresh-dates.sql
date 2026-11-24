-- Moves the seed's activity up to today, keeping the gaps between rows:
-- the newest change becomes now. What changed and Activity show the last
-- 30 days, so a seed made weeks ago would otherwise show nothing
-- (scripts/make-test-seed.mjs). Run after loading supabase/seed, as
-- .github/actions/own-test-database does.
update activity
set created_at = created_at + (now() - (select max(created_at) from activity))
where (select max(created_at) from activity) is not null;
