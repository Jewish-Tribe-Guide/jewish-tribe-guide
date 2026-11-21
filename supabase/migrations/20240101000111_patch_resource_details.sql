-- Changing a listing's details key by key (Nov 21 2026, step 2 of moving the
-- site's own state out of `details`; the plan is in docs/where-things-stand.md).
--
-- The site's jobs (Google sync, menu readings, source dates) read a listing's
-- `details`, change a key or two, and write the whole `details` back. A save
-- landing in between is lost: an admin's edit, a visitor's Yes, another
-- job's date. patch_resource_details changes only the keys it's given, in
-- one statement, so nothing else written since is touched.
--
-- It and the functions that already change the site's keys in place
-- (confirmations, item marks, approved dishes) turn on
-- `jpc.writes_site_state` around their own update, and off after it: they
-- are the site's writers of its own state. Today that changes nothing.
-- (A setting attached to the function, `alter function … set`, would be
-- simpler, but Supabase's SQL editor isn't allowed to: "permission denied
-- to set parameter", Nov 21. `set_config` at run time is allowed.) The
-- next migration (112) lets only those writers change the site's keys, so a
-- whole `details` written from anywhere else (an approved edit, an admin's
-- save, a script) can no longer wipe or roll them back.
--
-- Run in the Supabase SQL editor, dev then live (and on the test project).
-- The site uses the function when it's here and its old whole write when it
-- isn't, so before or after the deploy is fine. Safe to run twice.

-- `p_set`: keys to write. `p_unset`: keys to remove. `p_columns`: the
-- listing's other columns the same write changes (an approved edit's name,
-- address and the rest; a JSON null clears phone or address). `p_if`: written only if each named
-- value is still what the caller read; a key is a path with dots
-- ('sectionConfirmed.weekday'), and a JSON null means absent. True when the
-- listing was written.
create or replace function public.patch_resource_details(
  p_community text,
  p_id uuid,
  p_set jsonb,
  p_unset text[] default '{}',
  p_columns jsonb default null,
  p_if jsonb default null
)
returns boolean
language plpgsql
as $$
declare
  v_found boolean;
begin
  perform set_config('jpc.writes_site_state', 'on', true);
  update public.resource r
     set details = (coalesce(r.details, '{}'::jsonb) || coalesce(p_set, '{}'::jsonb)) - coalesce(p_unset, '{}'::text[]),
         name    = case when p_columns ? 'name' and jsonb_typeof(p_columns->'name') = 'string' then p_columns->>'name' else r.name end,
         phone   = case when p_columns ? 'phone' then p_columns->>'phone' else r.phone end,
         address = case when p_columns ? 'address' then p_columns->>'address' else r.address end,
         category    = case when p_columns ? 'category' and jsonb_typeof(p_columns->'category') = 'string' then p_columns->>'category' else r.category end,
         anchor_id   = case when p_columns ? 'anchor_id' and jsonb_typeof(p_columns->'anchor_id') = 'string' then p_columns->>'anchor_id' else r.anchor_id end,
         distance    = case when p_columns ? 'distance' then (p_columns->>'distance')::numeric else r.distance end,
         reviewed_at = case when p_columns ? 'reviewed_at' then (p_columns->>'reviewed_at')::timestamptz else r.reviewed_at end
   where r.community_id = p_community
     and r.id = p_id
     and (p_if is null or not exists (
       select 1 from jsonb_each(p_if) e
        where nullif(r.details #> string_to_array(e.key, '.'), 'null'::jsonb)
              is distinct from nullif(e.value, 'null'::jsonb)
     ));
  v_found := found;
  perform set_config('jpc.writes_site_state', '', true);
  return v_found;
end $$;

revoke execute on function public.patch_resource_details(text, uuid, jsonb, text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.patch_resource_details(text, uuid, jsonb, text[], jsonb, jsonb) to service_role;

-- The functions that already change the site's keys in place, each as its
-- latest migration left it, with the flag on around its update. Their
-- grants carry over.

-- confirm_resource, as in 20240101000083_confirmed_by_visitor.sql, its update marked.
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

  perform set_config('jpc.writes_site_state', 'on', true);
  update resource
     set details = coalesce(details, '{}'::jsonb)
                   || jsonb_build_object('confirmedAt', p_now,
                                         'confirmedBy', jsonb_build_object('by', 'visitor', 'at', p_now))
   where id = p_id;
  perform set_config('jpc.writes_site_state', '', true);
  return query select v_community, p_now, true;
end;
$$;

-- unconfirm_resource, as in 20240101000057_activity_and_counts.sql, its update marked.
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

  perform set_config('jpc.writes_site_state', 'on', true);
  update resource
     set details = case
       when p_previous is null then coalesce(details, '{}'::jsonb) - 'confirmedAt'
       else coalesce(details, '{}'::jsonb) || jsonb_build_object('confirmedAt', p_previous)
     end
   where id = p_id;
  perform set_config('jpc.writes_site_state', '', true);
  return query select v_community, p_previous, true;
end;
$$;

-- confirm_section, as in 20240101000082_contact_section_confirm.sql, its update marked.
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
  perform set_config('jpc.writes_site_state', 'on', true);
  update resource set details = v_details where id = p_id;
  perform set_config('jpc.writes_site_state', '', true);
  return query select v_community, p_now, true;
end;
$$;

-- unconfirm_section, as in 20240101000071_section_confirm.sql, its update marked.
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
  perform set_config('jpc.writes_site_state', 'on', true);
  update resource set details = v_details where id = p_id;
  perform set_config('jpc.writes_site_state', '', true);
  return query select v_community, p_previous, true;
end;
$$;

-- mark_item, as in 20240101000064_item_marks.sql, its update marked.
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

  perform set_config('jpc.writes_site_state', 'on', true);
  update resource set details = v_details where id = p_id;
  perform set_config('jpc.writes_site_state', '', true);
  return query select v_community, v_label, p_now, v_prev, v_gone, true;
end;
$$;

-- unmark_item, as in 20240101000064_item_marks.sql, its update marked.
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

  perform set_config('jpc.writes_site_state', 'on', true);
  update resource set details = v_details where id = p_id;
  perform set_config('jpc.writes_site_state', '', true);
  return query select v_community, true;
end;
$$;

-- clear_item_gone, as in 20240101000064_item_marks.sql, its update marked.
create or replace function clear_item_gone(p_id uuid, p_field text, p_label text)
returns void
language sql
as $$
  select set_config('jpc.writes_site_state', 'on', true);
  update resource
     set details = details #- array['itemGone', p_field, p_label]
   where id = p_id
     and details->'itemGone'->p_field ? p_label;
  select set_config('jpc.writes_site_state', '', true);
$$;

-- approve_menu_dishes, as in 20240101000065_menu_reading.sql, its update marked.
create or replace function approve_menu_dishes(
  p_id uuid,
  p_field text,
  p_items text[],
  p_now text,
  p_menu_url text
)
returns table (out_community text, out_labels text[])
language plpgsql
as $$
declare
  v_community text;
  v_details   jsonb;
  v_fields    jsonb;
  v_list      jsonb;
  v_some      jsonb;
  v_item      text;
  v_label     text;
  v_key       text;
  v_labels    text[] := '{}';
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

  if not exists (
    select 1 from jsonb_array_elements(v_fields) f
     where f->>'type' = 'tags' and f->>'key' = p_field
  ) then
    return;
  end if;

  v_list := case when jsonb_typeof(v_details->p_field) = 'array' then v_details->p_field else '[]'::jsonb end;
  v_some := case when jsonb_typeof(v_details->(p_field || '_sometimes')) = 'array' then v_details->(p_field || '_sometimes') else '[]'::jsonb end;

  foreach v_item in array coalesce(p_items, '{}') loop
    v_item := btrim(v_item);
    continue when v_item = '';
    v_key := p_field;
    v_label := null;
    select e into v_label from jsonb_array_elements_text(v_list) e where lower(btrim(e)) = lower(v_item) limit 1;
    if v_label is null then
      select e into v_label from jsonb_array_elements_text(v_some) e where lower(btrim(e)) = lower(v_item) limit 1;
      if v_label is not null then
        v_key := p_field || '_sometimes';
      end if;
    end if;
    if v_label is null then
      v_list := v_list || to_jsonb(v_item);
      v_label := v_item;
    end if;
    v_details := jsonb_set(v_details, array['itemMenu'], coalesce(v_details->'itemMenu', '{}'::jsonb), true);
    v_details := jsonb_set(v_details, array['itemMenu', v_key], coalesce(v_details->'itemMenu'->v_key, '{}'::jsonb), true);
    v_details := jsonb_set(v_details, array['itemMenu', v_key, v_label], to_jsonb(p_now), true);
    v_labels := v_labels || v_label;
  end loop;

  v_details := jsonb_set(v_details, array[p_field], v_list, true);
  if p_menu_url is not null then
    v_details := jsonb_set(v_details, array['menuUrl'], to_jsonb(p_menu_url), true);
  end if;

  perform set_config('jpc.writes_site_state', 'on', true);
  update resource set details = v_details where id = p_id;
  perform set_config('jpc.writes_site_state', '', true);
  return query select v_community, v_labels;
end;
$$;

insert into public.migration_ran (name) values ('20240101000111_patch_resource_details') on conflict (name) do nothing;
