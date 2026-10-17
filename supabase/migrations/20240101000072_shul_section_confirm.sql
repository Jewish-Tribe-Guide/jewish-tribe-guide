-- ─────────────────────────────────────────────────────────────────────────────
-- "Still right?" for a shul's weekday and Shabbos times, one at a time
-- (Oct 6). A shul's listing shows its usual times as two boxes, "Usual
-- weekday times" and "Usual Shabbos times", and someone who only davens
-- there on Shabbos can vouch for Shabbos without vouching for Shacharis.
--
--   details.sectionConfirmed.weekday / .shabbos = now
--
-- confirm_section (071) only took a yes/no section field (a mikvah's
-- "womenTevillah"); this lets it take 'weekday' and 'shabbos' too, for a
-- category with a davening (minyanim) field. Everything else is 071's:
-- under a row lock, live listings only, a repeat within the cooldown
-- changes nothing. unconfirm_section needs no change.
--
-- Run in the Supabase SQL editor AFTER 071, before deploying the code that
-- calls it.
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
  -- field. Otherwise, as 071: a yes/no section of this category, ticked on
  -- this listing.
  if p_section in ('weekday', 'shabbos') then
    if not exists (
      select 1 from jsonb_array_elements(v_fields) f
       where f->>'type' = 'minyanim'
    ) then
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
