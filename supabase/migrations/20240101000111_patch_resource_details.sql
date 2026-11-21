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
-- (confirmations, item marks, approved dishes) are marked as writers of the
-- site's state (`jpc.writes_site_state`). Today that changes nothing. The
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
set jpc.writes_site_state = 'on'
as $$
begin
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
  return found;
end $$;

revoke execute on function public.patch_resource_details(text, uuid, jsonb, text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.patch_resource_details(text, uuid, jsonb, text[], jsonb, jsonb) to service_role;

-- The functions that already change the site's keys in place.
alter function public.confirm_resource(uuid, text, integer) set jpc.writes_site_state = 'on';
alter function public.unconfirm_resource(uuid, text, text) set jpc.writes_site_state = 'on';
alter function public.confirm_section(uuid, text, text, integer) set jpc.writes_site_state = 'on';
alter function public.unconfirm_section(uuid, text, text, text) set jpc.writes_site_state = 'on';
alter function public.mark_item(uuid, text, text, text, text, integer) set jpc.writes_site_state = 'on';
alter function public.unmark_item(uuid, text, text, text, text, text, text) set jpc.writes_site_state = 'on';
alter function public.clear_item_gone(uuid, text, text) set jpc.writes_site_state = 'on';
alter function public.approve_menu_dishes(uuid, text, text[], text, text) set jpc.writes_site_state = 'on';

insert into public.migration_ran (name) values ('20240101000111_patch_resource_details') on conflict (name) do nothing;
