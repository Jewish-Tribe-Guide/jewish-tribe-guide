-- Drop indexes another index already covers (Nov 21 2026, the health sweep).
--
-- Postgres can use an index for any query on its leading columns, so a
-- one-column index on `community_id` is redundant beside a primary key or
-- unique index that starts with `community_id`. Each redundant index still
-- costs a write on every insert and update, and space. These came from 001
-- and 027 (which gave nine tables a `<table>_community_idx` each), before
-- the composite keys and 102's indexes existed.
--
--   dropped                         covered by
--   resource_community_idx          resource_community_status_category_idx (102)
--   submission_community_idx        submission_community_status_created_idx (102)
--   category_community_idx          category's primary key (community_id, id)
--   form_community_idx              form's primary key (community_id, id)
--   home_section_community_idx      home_section's primary key (community_id, id)
--   site_settings_community_idx     site_settings' primary key (community_id)
--   tag_community_idx               tag_community_slug_key (community_id, slug)
--   subscriber_community_idx        subscriber_community_email_idx (community_id, email)
--   resource_tag_resource_idx       resource_tag's unique (resource_id, tag_id)
--   vote_resource_idx               vote's primary key (resource_id, voter_token)
--
-- Each is dropped only if the database really has a different index whose
-- leading columns are the dropped one's, so a project where a key or 102
-- never ran keeps its index. What was dropped and what was kept is printed
-- (the editor's Messages).
--
-- Run in the Supabase SQL editor, dev then live, after 102. Nothing in the
-- site changes; the reads use the covering index instead. Safe to run twice.
-- To undo one: the create statement is in 001, 027 or 045.

do $$
declare
  r record;
  covering text;
begin
  for r in
    select * from (values
      ('resource',      'resource_community_idx',      array['community_id']),
      ('submission',    'submission_community_idx',    array['community_id']),
      ('category',      'category_community_idx',      array['community_id']),
      ('form',          'form_community_idx',          array['community_id']),
      ('home_section',  'home_section_community_idx',  array['community_id']),
      ('site_settings', 'site_settings_community_idx', array['community_id']),
      ('tag',           'tag_community_idx',           array['community_id']),
      ('subscriber',    'subscriber_community_idx',    array['community_id']),
      ('resource_tag',  'resource_tag_resource_idx',   array['resource_id']),
      ('vote',          'vote_resource_idx',           array['resource_id'])
    ) as v(tbl, idx, cols)
  loop
    if to_regclass('public.' || r.idx) is null then
      raise notice '% : not there, nothing to do', r.idx;
      continue;
    end if;

    -- Another valid, non-partial index on the same table whose first
    -- columns are exactly `cols`, in order.
    select c.relname into covering
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    where i.indrelid = ('public.' || r.tbl)::regclass
      and c.relname <> r.idx
      and i.indisvalid
      and i.indpred is null
      and i.indnkeyatts >= cardinality(r.cols)
      and (
        select array_agg(a.attname::text order by k.n)
        from unnest(i.indkey) with ordinality as k(attnum, n)
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
        where k.n <= cardinality(r.cols)
      ) = r.cols
    limit 1;

    if covering is null then
      raise notice '% : kept, no other index starts with %', r.idx, r.cols;
    else
      execute format('drop index if exists public.%I', r.idx);
      raise notice '% : dropped, % covers it', r.idx, covering;
    end if;
  end loop;
end $$;

insert into public.migration_ran (name) values ('20240101000108_drop_redundant_indexes') on conflict (name) do nothing;
