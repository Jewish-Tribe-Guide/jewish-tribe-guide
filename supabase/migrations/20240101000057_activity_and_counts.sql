-- ─────────────────────────────────────────────────────────────────────────────
-- The groundwork the redesign's "living" parts read from: what the community
-- did, when, and how often a listing is looked at or a search comes up empty.
-- Run in the Supabase SQL editor, before deploying the code that writes here.
--
-- Nothing in this file is shown publicly yet. It exists now so there is a
-- history to show later: the "This week" strip, credit on listings, and the
-- week-later "41 people have looked" email all need records that started
-- before anyone asked for them.
--
-- All three objects are server-only (service-role key): RLS on, no policies,
-- and explicit grants to service_role alone, since Supabase no longer grants
-- new tables to the Data API by default (see 20240101000056's own comment).
--
-- community_id has no default, same reasoning as campaign_banner: a write that
-- forgets to scope itself should fail rather than land on 'philly'.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Activity log ─────────────────────────────────────────────────────────────
-- One row per thing that happened to a listing. `actor_email` is the address a
-- submitter chose to give (lowercased), or null for "a neighbor": a one-tap
-- confirmation, an edit with no email, the Google sync. It is never shown as
-- is; later steps turn it into a chosen display name or "a neighbor".
create table if not exists activity (
  id            bigserial primary key,
  community_id  text not null,
  resource_id   uuid,
  kind          text not null check (kind in (
    'listing_added', 'listing_edited', 'listing_removed', 'listing_confirmed',
    'item_added', 'item_confirmed', 'item_reported_gone'
  )),
  source        text not null check (source in ('visitor', 'submission', 'google')),
  -- For item_* kinds: which tags field and which item ("Challah").
  field_key     text,
  item          text,
  actor_email   text,
  submission_id uuid,
  created_at    timestamptz not null default now()
);

create index if not exists activity_recent_idx on activity (community_id, created_at desc);
create index if not exists activity_resource_idx on activity (resource_id, created_at desc);
create index if not exists activity_actor_idx on activity (community_id, actor_email) where actor_email is not null;

alter table activity enable row level security;
grant select, insert, update, delete on public.activity to service_role;
grant usage, select on sequence public.activity_id_seq to service_role;

-- ── Daily counts ─────────────────────────────────────────────────────────────
-- Totals only, never who: how many times a listing was opened each day, and
-- how many times a search found nothing. `key` is the listing id for a view
-- and the normalised search text for a miss.
create table if not exists daily_count (
  community_id text not null,
  kind         text not null check (kind in ('listing_view', 'search_miss')),
  key          text not null,
  day          date not null,
  count        integer not null default 0,
  primary key (community_id, kind, key, day)
);

alter table daily_count enable row level security;
grant select, insert, update, delete on public.daily_count to service_role;

-- One round trip, and two simultaneous bumps both count. A view is only
-- counted for a live listing in that community, and a miss only for a real
-- community, so a script posting made-up ids can't fill the table with junk.
create or replace function bump_daily_count(p_community text, p_kind text, p_key text, p_day date)
returns void
language sql
as $$
  insert into daily_count (community_id, kind, key, day, count)
  select p_community, p_kind, p_key, p_day, 1
  where exists (select 1 from community where slug = p_community)
    and (
      p_kind <> 'listing_view'
      or exists (
        select 1 from resource
        where id::text = p_key and community_id = p_community and status = 'approved'
      )
    )
  on conflict (community_id, kind, key, day)
  do update set count = daily_count.count + 1;
$$;

revoke execute on function bump_daily_count(text, text, text, date) from public, anon, authenticated;
grant execute on function bump_daily_count(text, text, text, date) to service_role;

-- ── "Mark as current", atomically ────────────────────────────────────────────
-- The route used to read the whole `details` object, add confirmedAt, and
-- write the whole object back. Two writes landing together (a confirmation
-- and an approval, or two confirmations) could each undo the other. These
-- change one key under a row lock instead.
--
-- Only live listings can be confirmed. A repeat within the cooldown is a
-- no-op (out_changed = false), so a script tapping the button in a loop can't
-- keep a listing looking fresh or make the site refetch everything each time.
create or replace function confirm_resource(p_id uuid, p_now text, p_cooldown_seconds integer default 600)
returns table (out_community text, out_confirmed_at text, out_changed boolean)
language plpgsql
as $$
declare
  v_community text;
  v_prev      text;
begin
  select r.community_id, r.details->>'confirmedAt'
    into v_community, v_prev
    from resource r
   where r.id = p_id and r.status = 'approved'
     for update;
  if not found then
    return;
  end if;

  if v_prev ~ '^\d{4}-\d{2}-\d{2}T'
     and v_prev::timestamptz > p_now::timestamptz - make_interval(secs => p_cooldown_seconds) then
    return query select v_community, v_prev, false;
    return;
  end if;

  update resource
     set details = coalesce(details, '{}'::jsonb) || jsonb_build_object('confirmedAt', p_now)
   where id = p_id;
  return query select v_community, p_now, true;
end;
$$;

-- Undo. When p_expected is given, only undoes if the listing still carries the
-- confirmation this visitor made, so an undo can't wipe out someone else's
-- later one. p_previous null means "there was none before", so the key goes.
create or replace function unconfirm_resource(p_id uuid, p_expected text, p_previous text)
returns table (out_community text, out_confirmed_at text, out_changed boolean)
language plpgsql
as $$
declare
  v_community text;
  v_current   text;
begin
  select r.community_id, r.details->>'confirmedAt'
    into v_community, v_current
    from resource r
   where r.id = p_id and r.status = 'approved'
     for update;
  if not found then
    return;
  end if;

  if p_expected is not null and v_current is distinct from p_expected then
    return query select v_community, v_current, false;
    return;
  end if;

  update resource
     set details = case
       when p_previous is null then coalesce(details, '{}'::jsonb) - 'confirmedAt'
       else coalesce(details, '{}'::jsonb) || jsonb_build_object('confirmedAt', p_previous)
     end
   where id = p_id;
  return query select v_community, p_previous, true;
end;
$$;

revoke execute on function confirm_resource(uuid, text, integer) from public, anon, authenticated;
revoke execute on function unconfirm_resource(uuid, text, text) from public, anon, authenticated;
grant execute on function confirm_resource(uuid, text, integer) to service_role;
grant execute on function unconfirm_resource(uuid, text, text) to service_role;
