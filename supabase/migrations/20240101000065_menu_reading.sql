-- ─────────────────────────────────────────────────────────────────────────────
-- Main dishes, read from each place's own menu (build plan step 3, agreed
-- Oct 1). On the admin's "Main dishes" tab, the AI reads a food place's
-- own menu page once, on demand, and proposes up to ten main dishes, each
-- with the line of the menu it read it from. Nothing shows until an admin
-- approves it: they untick what's wrong, add what's missing, and approve.
--
--   menu_reading           what the AI proposed for each place, and what
--                          the admin decided. One row per place: reading
--                          it again replaces it.
--   approve_menu_dishes    puts the approved dishes on the listing, each
--                          dated details.itemMenu[field][dish] = now ("on its
--                          menu Oct 2", never "seen": a menu isn't someone
--                          eating there), and keeps the menu's address
--                          (details.menuUrl, the listing's "Full menu ↗").
--
-- Run in the Supabase SQL editor, before deploying the code that calls these.
-- The site works without them: the tab says the migration hasn't been run.
--
-- Server-only, as 057, 062 and 064: RLS on, no policies, service_role grants
-- alone.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists menu_reading (
  community_id text not null,
  resource_id  uuid not null,
  -- proposed: waiting on an admin; approved; skipped (not now); failed (no
  -- menu could be read, `note` says why).
  status       text not null check (status in ('proposed', 'approved', 'skipped', 'failed')),
  -- The page or PDF the dishes were read from.
  source_url   text,
  -- [{ name, quote, checked }]: each dish, the menu's own words it was read
  -- from, and whether those words were found on the page (see menuReader.ts).
  dishes       jsonb not null default '[]'::jsonb,
  note         text,
  model        text,
  read_at      timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   text,
  primary key (community_id, resource_id)
);

alter table menu_reading enable row level security;
grant select, insert, update, delete on public.menu_reading to service_role;

-- Adds the approved dishes to a live listing's item list, under a row lock
-- (as mark_item, 064): a dish it already lists, under any case, in the list
-- or its "_sometimes" part, keeps its place and is only dated. Only into a
-- field the category keeps as an item list. Returns the dishes as the
-- listing now stores them.
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

  update resource set details = v_details where id = p_id;
  return query select v_community, v_labels;
end;
$$;

revoke execute on function approve_menu_dishes(uuid, text, text[], text, text) from public, anon, authenticated;
grant execute on function approve_menu_dishes(uuid, text, text[], text, text) to service_role;
