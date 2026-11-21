-- Deleting a category, a form or a community in one step (Nov 21 2026, the
-- save survey's item 6).
--
-- Each was a run of separate deletes from the site (listings, then eruvim
-- and their watches, then the category; responses, then the form; every
-- table, then the community). A failure partway left the rest standing: a
-- category with no listings, a community with half its tables. Here each is
-- one function, so it all goes or none of it does.
--
-- The site calls these when they're here and keeps its old step-by-step
-- delete when they aren't (categoryStore, formStore, communityStore), so
-- running this before or after the deploy is fine.
--
-- Run in the Supabase SQL editor, dev then live. Safe to run twice.

-- A category and its listings; for the Eruv category, every eruv and the
-- watches on their websites too (`p_watch_creator`, eruvWebsite.ts).
create or replace function public.delete_category(p_community text, p_id text, p_eruv boolean, p_watch_creator text)
returns void
language plpgsql
as $$
begin
  delete from public.resource where community_id = p_community and category = p_id;
  if p_eruv then
    delete from public.watch where community_id = p_community and created_by = p_watch_creator;
    delete from public.eruv where community_id = p_community;
  end if;
  delete from public.category where community_id = p_community and id = p_id;
end $$;

-- A form and every response to it.
create or replace function public.delete_form(p_community text, p_id text)
returns void
language plpgsql
as $$
begin
  delete from public.form_response where community_id = p_community and form_id = p_id;
  delete from public.form where community_id = p_community and id = p_id;
end $$;

-- A community and its rows in every table the site names
-- (COMMUNITY_SCOPED_TABLES, communityStore.ts), in that order; a table this
-- database doesn't have yet is skipped. Never the default community.
create or replace function public.delete_community(p_slug text, p_tables text[])
returns void
language plpgsql
as $$
declare
  t text;
begin
  if exists (select 1 from public.community where slug = p_slug and is_default) then
    raise exception 'The default community cannot be deleted.';
  end if;
  foreach t in array p_tables loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('delete from public.%I where community_id = $1', t) using p_slug;
    end if;
  end loop;
  delete from public.community where slug = p_slug;
end $$;

revoke execute on function public.delete_category(text, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.delete_form(text, text) from public, anon, authenticated;
revoke execute on function public.delete_community(text, text[]) from public, anon, authenticated;
grant execute on function public.delete_category(text, text, boolean, text) to service_role;
grant execute on function public.delete_form(text, text) to service_role;
grant execute on function public.delete_community(text, text[]) to service_role;

insert into public.migration_ran (name) values ('20240101000109_delete_in_one_step') on conflict (name) do nothing;
