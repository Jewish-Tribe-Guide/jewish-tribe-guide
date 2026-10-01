-- ─────────────────────────────────────────────────────────────────────────────
-- "Still here" and "Not anymore", an item at a time (build plan step 3,
-- agreed Oct 1). A visitor taps an item on an opened listing ("Challah") and
-- says whether it's still there.
--
--   Still here   details.itemSeen[field][item] = now, at once, no review.
--                It also clears a "reported gone" on that item: someone has
--                seen it since.
--   Not anymore  details.itemGone[field][item] = now: a warning on the item
--                at once ("Reported gone today · we'll check before taking
--                it off"). The removal itself is an ordinary edit suggestion
--                in the moderation queue; rejecting it clears the warning,
--                approving it takes the item off.
--
-- Run in the Supabase SQL editor, before deploying the code that calls these.
--
-- Built like confirm_resource (057): one key under a row lock, never a
-- read-modify-write of the whole details object; only live listings; a
-- repeat within the cooldown changes nothing. And only an item the listing
-- actually lists, in a field its category keeps as an item list (a `tags`
-- field, or its `_sometimes` companion), so nobody can write a date against
-- a made-up item or any other key.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function mark_item(
  p_id uuid,
  p_field text,
  p_item text,
  p_kind text,
  p_now text,
  p_cooldown_seconds integer default 600
)
returns table (
  out_community text,
  out_label text,
  out_at text,
  out_previous text,
  out_cleared_gone text,
  out_changed boolean
)
language plpgsql
as $$
declare
  v_community text;
  v_details   jsonb;
  v_fields    jsonb;
  v_label     text;
  v_map       text := case p_kind when 'seen' then 'itemSeen' when 'gone' then 'itemGone' end;
  v_prev      text;
  v_gone      text;
begin
  if v_map is null then
    return;
  end if;

  select r.community_id, coalesce(r.details, '{}'::jsonb), c.fields
    into v_community, v_details, v_fields
    from resource r
    join category c on c.community_id = r.community_id and c.id = r.category
   where r.id = p_id and r.status = 'approved'
     for update of r;
  if not found then
    return;
  end if;

  -- The field must be one of the category's item lists.
  if not exists (
    select 1 from jsonb_array_elements(v_fields) f
     where f->>'type' = 'tags'
       and (f->>'key' = p_field or (f->>'key') || '_sometimes' = p_field)
  ) then
    return;
  end if;

  -- The item as the listing stores it, matched without case or spaces.
  select e into v_label
    from jsonb_array_elements_text(
           case when jsonb_typeof(v_details->p_field) = 'array' then v_details->p_field else '[]'::jsonb end
         ) e
   where lower(btrim(e)) = lower(btrim(p_item))
   limit 1;
  if v_label is null then
    return;
  end if;

  v_prev := v_details->v_map->p_field->>v_label;

  if p_kind = 'seen' then
    if v_prev ~ '^\d{4}-\d{2}-\d{2}T'
       and v_prev::timestamptz > p_now::timestamptz - make_interval(secs => p_cooldown_seconds) then
      return query select v_community, v_label, v_prev, v_prev, null::text, false;
      return;
    end if;
  else
    -- Already reported and waiting on an admin: nothing new to say.
    if v_prev is not null then
      return query select v_community, v_label, v_prev, v_prev, null::text, false;
      return;
    end if;
  end if;

  v_details := jsonb_set(v_details, array[v_map], coalesce(v_details->v_map, '{}'::jsonb), true);
  v_details := jsonb_set(v_details, array[v_map, p_field], coalesce(v_details->v_map->p_field, '{}'::jsonb), true);
  v_details := jsonb_set(v_details, array[v_map, p_field, v_label], to_jsonb(p_now), true);

  if p_kind = 'seen' then
    v_gone := v_details->'itemGone'->p_field->>v_label;
    if v_gone is not null then
      v_details := v_details #- array['itemGone', p_field, v_label];
    end if;
  end if;

  update resource set details = v_details where id = p_id;
  return query select v_community, v_label, p_now, v_prev, v_gone, true;
end;
$$;

-- Undo. Only when the item still carries the mark this visitor made
-- (p_expected), so an undo can't wipe out someone else's later one. The
-- previous date goes back (or the key goes, when there was none), and for
-- "Still here", a "reported gone" it cleared comes back.
create or replace function unmark_item(
  p_id uuid,
  p_field text,
  p_label text,
  p_kind text,
  p_expected text,
  p_previous text,
  p_restore_gone text
)
returns table (out_community text, out_changed boolean)
language plpgsql
as $$
declare
  v_community text;
  v_details   jsonb;
  v_map       text := case p_kind when 'seen' then 'itemSeen' when 'gone' then 'itemGone' end;
begin
  if v_map is null then
    return;
  end if;

  select r.community_id, coalesce(r.details, '{}'::jsonb)
    into v_community, v_details
    from resource r
   where r.id = p_id and r.status = 'approved'
     for update;
  if not found then
    return;
  end if;

  if (v_details->v_map->p_field->>p_label) is distinct from p_expected then
    return query select v_community, false;
    return;
  end if;

  if p_previous is null then
    v_details := v_details #- array[v_map, p_field, p_label];
  else
    v_details := jsonb_set(v_details, array[v_map, p_field, p_label], to_jsonb(p_previous), true);
  end if;

  if p_kind = 'seen' and p_restore_gone is not null
     and (v_details->'itemGone'->p_field->>p_label) is null then
    v_details := jsonb_set(v_details, array['itemGone'], coalesce(v_details->'itemGone', '{}'::jsonb), true);
    v_details := jsonb_set(v_details, array['itemGone', p_field], coalesce(v_details->'itemGone'->p_field, '{}'::jsonb), true);
    v_details := jsonb_set(v_details, array['itemGone', p_field, p_label], to_jsonb(p_restore_gone), true);
  end if;

  update resource set details = v_details where id = p_id;
  return query select v_community, true;
end;
$$;

-- Clearing a "reported gone" when an admin keeps the item (rejects the
-- removal). Only the warning: the item's "seen" date is left alone.
create or replace function clear_item_gone(p_id uuid, p_field text, p_label text)
returns void
language sql
as $$
  update resource
     set details = details #- array['itemGone', p_field, p_label]
   where id = p_id
     and details->'itemGone'->p_field ? p_label;
$$;

revoke execute on function mark_item(uuid, text, text, text, text, integer) from public, anon, authenticated;
revoke execute on function unmark_item(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function clear_item_gone(uuid, text, text) from public, anon, authenticated;
grant execute on function mark_item(uuid, text, text, text, text, integer) to service_role;
grant execute on function unmark_item(uuid, text, text, text, text, text, text) to service_role;
grant execute on function clear_item_gone(uuid, text, text) to service_role;
