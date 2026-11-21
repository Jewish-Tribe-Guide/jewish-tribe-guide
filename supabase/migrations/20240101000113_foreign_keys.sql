-- Rows that point at something now need it to be there (Nov 21 2026, the
-- health sweep's "foreign keys").
--
-- Until now only the site's code kept a listing's category, a reading's
-- listing or a row's community real. A delete that went round it (a test
-- cleaning up, a script, a delete that failed partway) left rows pointing at
-- nothing: on dev, categories of communities long deleted, and listings in
-- categories that are gone. Live was clean when surveyed (Nov 21), apart from
-- the history kept on purpose (below).
--
-- What each delete does now:
--   a community   → every row of its, in every table with a community_id
--   a category    → its campaign banners and taught question words; refused
--                   while listings are still in it (delete_category, 109,
--                   deletes them first, as every caller does)
--   a listing     → its menu readings and its watches
--   a form        → its responses
--
-- Left without a key, on purpose: activity's resource_id and submission_id,
-- and submission.target_id. They are history, kept after a listing is
-- deleted for good (live has 111 approved removals pointing at listings
-- since deleted). resource.anchor_id holds 'all' and 'community' as well as
-- hospital ids. The *_by columns are emails.
--
-- Each key is added NOT VALID, so it holds for every row written from now
-- on, and then checked against the rows already there. Where old rows break
-- it (dev's test leftovers), the check is skipped with a notice naming the
-- key, and the key still holds for new rows. Nothing is deleted here.
--
-- Run in the Supabase SQL editor, dev then live. Safe to run twice; order
-- with the deploy doesn't matter (the site already deletes children first).

do $$
declare
  t text;
  k record;
begin
  -- Every table with a community_id.
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'community_id' and c.table_name <> 'community'
    order by 1
  loop
    if not exists (select 1 from pg_constraint where conname = t || '_community_fk' and conrelid = ('public.' || t)::regclass) then
      execute format(
        'alter table public.%I add constraint %I foreign key (community_id) references public.community (slug) on delete cascade not valid',
        t, t || '_community_fk');
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'resource_category_fk') then
    alter table public.resource add constraint resource_category_fk
      foreign key (community_id, category) references public.category (community_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'menu_reading_resource_fk') then
    alter table public.menu_reading add constraint menu_reading_resource_fk
      foreign key (resource_id) references public.resource (id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'watch_resource_fk') then
    alter table public.watch add constraint watch_resource_fk
      foreign key (resource_id) references public.resource (id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'form_response_form_fk') then
    alter table public.form_response add constraint form_response_form_fk
      foreign key (community_id, form_id) references public.form (community_id, id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaign_banner_category_fk') then
    alter table public.campaign_banner add constraint campaign_banner_category_fk
      foreign key (community_id, category_id) references public.category (community_id, id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'question_word_category_fk') then
    alter table public.question_word add constraint question_word_category_fk
      foreign key (community_id, category_id) references public.category (community_id, id) on delete cascade not valid;
  end if;

  -- Check the rows already there, key by key.
  for k in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'f' and not convalidated and connamespace = 'public'::regnamespace
      and (conname like '%\_community\_fk' or conname in (
        'resource_category_fk', 'menu_reading_resource_fk', 'watch_resource_fk',
        'form_response_form_fk', 'campaign_banner_category_fk', 'question_word_category_fk'))
  loop
    begin
      execute format('alter table %s validate constraint %I', k.tbl, k.conname);
    exception when foreign_key_violation then
      raise notice 'Not checked against old rows (some point at nothing): %', k.conname;
    end;
  end loop;
end $$;

insert into public.migration_ran (name) values ('20240101000113_foreign_keys') on conflict (name) do nothing;
