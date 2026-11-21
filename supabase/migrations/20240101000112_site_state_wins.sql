-- Only the site's own writers change its keys (Nov 21 2026, the last step of
-- moving the site's own state out of `details`; the plan is in
-- docs/where-things-stand.md).
--
-- Until now `state` was copied from every write of `details` (110). Now it's
-- the other way round. A write that isn't marked as a writer of the site's
-- state (`jpc.writes_site_state`, set on patch_resource_details and the
-- confirm / mark / dishes functions by 111) keeps the listing's `state`, and
-- its `details` gets the site's keys from `state`. So an approved edit
-- carrying a week-old copy of the listing, an admin's save, or a script
-- writing the whole `details` can no longer wipe a confirmation, an item
-- mark or the Google sync's record, or roll one back.
--
-- `details` keeps a copy of the site's keys, so nothing that reads a
-- listing changes.
--
-- A new listing takes the site's keys its `details` arrives with (an import's
-- legacyId). A write that sets `state` itself (sync-dev-from-prod copying
-- live's rows, a test fixture reset to `{}`) has its `state` kept.
--
-- Run in the Supabase SQL editor, dev then live (and on the test project),
-- only after 111 has run and the deploy that writes through
-- patch_resource_details is live: from here, a site write of those keys that
-- doesn't go through it is ignored. Safe to run twice.
-- To undo: run 110's trigger function again.

create or replace function public.resource_state_from_details()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or coalesce(current_setting('jpc.writes_site_state', true), '') = 'on' then
    new.state := public.site_state_of(new.details);
  elsif new.state is distinct from old.state then
    new.details := (coalesce(new.details, '{}'::jsonb) - public.site_state_keys()) || new.state;
  else
    new.details := (coalesce(new.details, '{}'::jsonb) - public.site_state_keys()) || old.state;
    new.state := old.state;
  end if;
  return new;
end $$;

insert into public.migration_ran (name) values ('20240101000112_site_state_wins') on conflict (name) do nothing;
