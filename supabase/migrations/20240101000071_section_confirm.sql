-- ─────────────────────────────────────────────────────────────────────────────
-- "Still right?" a section at a time (Oct 6). A mikvah's women's, men's and
-- keilim hours are each confirmed on their own: one date for all three read
-- as only the last one's, and someone who uses one mikvah knows that one's
-- hours, not the others'.
--
--   details.sectionConfirmed[section] = now
--
-- where `section` is the key of the yes/no field that says the listing
-- serves that audience ("womenTevillah"), the one its section's fields name
-- as their audienceKey.
--
-- Run in the Supabase SQL editor, before deploying the code that calls these.
--
-- Built like confirm_resource (057) and mark_item (064): one key under a row
-- lock, never a read-modify-write of the whole details object; only live
-- listings; a repeat within the cooldown changes nothing. And only a section
-- the listing really has: a yes/no field of its category that some field
-- names as its audience, ticked on this listing. Nothing else can be dated.
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

  -- A section of this category, served by this listing.
  if not exists (
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

-- Undo. Only when the section still carries the date this visitor set
-- (p_expected), so an undo can't wipe out someone else's later one. The
-- previous date goes back, or the key goes when there was none.
create or replace function unconfirm_section(p_id uuid, p_section text, p_expected text, p_previous text)
returns table (out_community text, out_confirmed_at text, out_changed boolean)
language plpgsql
as $$
declare
  v_community text;
  v_details   jsonb;
  v_current   text;
begin
  select r.community_id, coalesce(r.details, '{}'::jsonb)
    into v_community, v_details
    from resource r
   where r.id = p_id and r.status = 'approved'
     for update;
  if not found then
    return;
  end if;

  v_current := v_details->'sectionConfirmed'->>p_section;
  if v_current is null or (p_expected is not null and v_current is distinct from p_expected) then
    return query select v_community, v_current, false;
    return;
  end if;

  if p_previous is null then
    v_details := v_details #- array['sectionConfirmed', p_section];
  else
    v_details := jsonb_set(v_details, array['sectionConfirmed', p_section], to_jsonb(p_previous), true);
  end if;
  update resource set details = v_details where id = p_id;
  return query select v_community, p_previous, true;
end;
$$;
