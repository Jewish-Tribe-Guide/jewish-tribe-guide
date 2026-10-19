-- ─────────────────────────────────────────────────────────────────────────────
-- "Confirmed by a community member, Oct 17" under a listing a visitor said
-- Yes to (Oct 17, the user: a visitor's tap says so, an approved edit says
-- "Updated by a community member", an admin's stamp stays "Confirmed").
--
--   details.confirmedBy = { by: 'visitor', at: <the confirmedAt it set> }
--
-- Written in the same row-locked update as confirmedAt, so it can't land on
-- a different date. `at` is what ties it to that date: once an approval or
-- an admin's stamp sets a new confirmedAt, the line says what they say, and
-- an undo (unconfirm_resource, unchanged) puts back a date this doesn't
-- match, so it says plain "Confirmed". A box's own date
-- (confirm_section) needs nothing: it's only ever a visitor's.
--
-- Run in the Supabase SQL editor, test project then production, in either
-- order with the deploy: until it runs, a visitor's Yes on the whole
-- listing says plain "Confirmed", as before, and nothing else changes.
-- ─────────────────────────────────────────────────────────────────────────────

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
     set details = coalesce(details, '{}'::jsonb)
                   || jsonb_build_object('confirmedAt', p_now,
                                         'confirmedBy', jsonb_build_object('by', 'visitor', 'at', p_now))
   where id = p_id;
  return query select v_community, p_now, true;
end;
$$;
