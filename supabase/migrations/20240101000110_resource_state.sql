-- A listing's own state in a column of its own (Nov 21 2026, step 1 of
-- moving it out of `details`; the plan is in docs/where-things-stand.md).
--
-- `details` holds what people wrote and, beside it, the keys the site keeps
-- for itself: Google sync state, confirmations, item marks
-- (SITE_STATE_KEYS, src/lib/syncFields.ts, which must list the same keys as
-- site_state_keys() below). A write of a whole `details` that leaves them
-- out wipes them. `state` will hold them instead.
--
-- This step changes nothing the site reads. Every write of `details`, from
-- the site, a SQL function or a script, copies those keys into `state` (the
-- trigger below), and every row is copied once here. So from the moment
-- this runs, `state` is always exactly the site's keys of `details`, and the
-- next steps can move readers and writers over one at a time.
--
-- Run in the Supabase SQL editor, dev then live, any time before the next
-- step deploys. Safe to run twice.

alter table public.resource add column if not exists state jsonb not null default '{}'::jsonb;

-- The keys that move. Same list as SITE_STATE_KEYS (resourceState.test.ts
-- holds them together).
create or replace function public.site_state_keys()
returns text[]
language sql
immutable
as $$
  select array[
    'googleSyncedAt', 'googleKept', 'notOnGoogle', 'googleWrong', 'googleCheck',
    'googleStopped', 'googleStatusCheckedAt', 'lastSyncError', 'lastSyncFailedAt',
    'businessStatus', 'businessStatusBefore', 'businessStatusChangedAt',
    'businessStatusOverride', 'businessStatusKeptAt', 'verifiedPlaceId', 'legacyId',
    'itemSeen', 'itemGone', 'itemMenu', 'sectionConfirmed', 'sectionFrom',
    'confirmedAt', 'confirmedFrom', 'confirmedBy', 'googleFields'
  ]::text[]
$$;

-- The site's keys of a `details`.
create or replace function public.site_state_of(p_details jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
    from jsonb_each(coalesce(p_details, '{}'::jsonb)) e
   where e.key = any(public.site_state_keys())
$$;

create or replace function public.resource_state_from_details()
returns trigger
language plpgsql
as $$
begin
  new.state := public.site_state_of(new.details);
  return new;
end $$;

drop trigger if exists resource_state_from_details on public.resource;
create trigger resource_state_from_details
  before insert or update on public.resource
  for each row execute function public.resource_state_from_details();

-- Every row once. Through the trigger, so it's the same copy.
update public.resource set state = public.site_state_of(details)
 where state is distinct from public.site_state_of(details);

insert into public.migration_ran (name) values ('20240101000110_resource_state') on conflict (name) do nothing;
