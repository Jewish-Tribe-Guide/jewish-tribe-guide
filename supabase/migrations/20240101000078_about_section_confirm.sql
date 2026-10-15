-- ─────────────────────────────────────────────────────────────────────────────
-- "Confirmed Sep 29 · Still right?" under a listing's About (Oct 15: the
-- user, "a line that says when that was last updated"), on its own, as a
-- hospital's boxes have (073): someone who has been there can vouch for the
-- description without vouching for the hours.
--
--   details.sectionConfirmed.<the description's field key> = now
--
-- About is confirmed under its first description with words in it
-- (ListingView, aboutKey). This lets confirm_section take that
-- key: a 'textarea' field of this category, not blank on this listing.
-- Everything else is 071's to 073's: under a row lock, live listings only,
-- a repeat within the cooldown changes nothing. unconfirm_section needs no
-- change.
--
-- A description Google keeps says "Last updated from Google" instead and is
-- never asked about, so it never reaches this.
--
-- Run in the Supabase SQL editor AFTER 077, before deploying the code that
-- calls it (test, then production). Until it runs, Yes under About answers
-- "Didn't save" and nothing else is affected.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function confirm_section(
  p_id uuid,
  p_section text,
  p_now text,
  p_cooldown_seconds integer default 600
)
returns table (out_community text, out_confirmed_at text, out_changed boolean)
language plpgsql
as $$
declare
  v_community text;
  v_details   jsonb;
  v_fields    jsonb;
  v_prev      text;
begin
  select r.community_id, coalesce(r.details, '{}'::jsonb), c.fields
    into v_community, v_details, v_fields
    from resource r
    join category c on c.community_id = r.community_id and c.id = r.category
   where r.id = p_id and r.status = 'approved'
     for update of r;
  if not found then
    return;
  end if;

  -- A shul's weekday or Shabbos times (072): a category with a davening
  -- field. A box of contacts (073) and About (078), below. Otherwise, as
  -- 071: a yes/no
  -- section of this category, ticked on this listing.
  if p_section in ('weekday', 'shabbos') then
    if not exists (
      select 1 from jsonb_array_elements(v_fields) f
       where f->>'type' = 'minyanim'
    ) then
      return;
    end if;
  -- A box of lists of contacts (073): a 'contacts' field of this category,
  -- with something in it on this listing.
  elsif exists (
    select 1 from jsonb_array_elements(v_fields) f
     where f->>'key' = p_section and f->>'type' = 'contacts'
  ) then
    if jsonb_typeof(v_details->p_section) is distinct from 'array'
       or jsonb_array_length(v_details->p_section) = 0 then
      return;
    end if;
  -- A listing's About (078): a 'textarea' field of this category, with
  -- words in it on this listing.
  elsif exists (
    select 1 from jsonb_array_elements(v_fields) f
     where f->>'key' = p_section and f->>'type' = 'textarea'
  ) then
    if jsonb_typeof(v_details->p_section) is distinct from 'string'
       or btrim(v_details->>p_section) = '' then
      return;
    end if;
  elsif not exists (
    select 1 from jsonb_array_elements(v_fields) f
     where f->>'key' = p_section and f->>'type' = 'boolean'
  ) or not exists (
    select 1 from jsonb_array_elements(v_fields) f
     where f->>'audienceKey' = p_section
  ) or v_details->p_section is distinct from 'true'::jsonb then
    return;
  end if;

  v_prev := v_details->'sectionConfirmed'->>p_section;
  if v_prev ~ '^\d{4}-\d{2}-\d{2}T'
     and v_prev::timestamptz > p_now::timestamptz - make_interval(secs => p_cooldown_seconds) then
    return query select v_community, v_prev, false;
    return;
  end if;

  v_details := jsonb_set(v_details, array['sectionConfirmed'], coalesce(v_details->'sectionConfirmed', '{}'::jsonb), true);
  v_details := jsonb_set(v_details, array['sectionConfirmed', p_section], to_jsonb(p_now), true);
  update resource set details = v_details where id = p_id;
  return query select v_community, p_now, true;
end;
$$;
