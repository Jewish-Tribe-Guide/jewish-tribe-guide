-- ─────────────────────────────────────────────────────────────────────────────
-- "Confirmed Sep 29 · Still right?" under a listing's contact box (its
-- address, phone, website, email and hours) when Google doesn't keep it
-- (Oct 15, the user: "If address, phone, website, and email stuff isn't
-- from Google then we should use 'confirmed (date)' like we do in other
-- places").
--
--   details.sectionConfirmed.contact = now
--
-- 'contact' isn't a field of any category (the address and phone are the
-- resource's own columns), so 079's "a field of this category with
-- something in it" refused it. This takes it for any live listing; every
-- other key is checked as 079 checked it. unconfirm_section needs no change.
--
-- Run in the Supabase SQL editor AFTER 079, before deploying the code that
-- calls it (test, then production). Until it runs, Yes under the contact box
-- answers "Didn't save" and nothing else is affected.
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
  v_value     jsonb;
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

  if p_section = 'contact' then
    -- The contact box (082): every listing has one.
    null;
  elsif p_section in ('weekday', 'shabbos') then
    -- A shul's weekday or Shabbos times (072): a category with a davening
    -- field.
    if not exists (
      select 1 from jsonb_array_elements(v_fields) f
       where f->>'type' = 'minyanim'
    ) then
      return;
    end if;
  else
    -- Any other: a field of this category, with something in it on this
    -- listing. A ticked yes/no (071's sections), a list with an entry in it
    -- (073's contacts), words (078's description), a choice (the eruv).
    if not exists (
      select 1 from jsonb_array_elements(v_fields) f
       where f->>'key' = p_section
    ) then
      return;
    end if;
    v_value := v_details->p_section;
    if v_value is null
       or (jsonb_typeof(v_value) = 'string' and btrim(v_value #>> '{}') = '')
       or (jsonb_typeof(v_value) = 'array' and jsonb_array_length(v_value) = 0)
       or (jsonb_typeof(v_value) = 'object' and v_value = '{}'::jsonb)
       or (jsonb_typeof(v_value) = 'boolean' and v_value <> 'true'::jsonb)
       or jsonb_typeof(v_value) = 'null' then
      return;
    end if;
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
