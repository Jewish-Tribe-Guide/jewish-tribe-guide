-- After rows are copied in with their ids (scripts/restore.mjs), move each
-- id counter past the highest id copied, or the next insert collides with a
-- copied row ("duplicate key value violates unique constraint
-- activity_pkey", Nov 23). The API can't do this; run it in the SQL editor
-- (or psql) once the restore is done. Safe to run twice.
do $$
declare s record; top bigint;
begin
  for s in
    select n.nspname as sch, t.relname as tbl, a.attname as col, pg_get_serial_sequence(format('%I.%I', n.nspname, t.relname), a.attname) as seq
    from pg_attribute a
    join pg_class t on t.oid = a.attrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relkind = 'r' and a.attnum > 0 and not a.attisdropped
      and pg_get_serial_sequence(format('%I.%I', n.nspname, t.relname), a.attname) is not null
  loop
    execute format('select max(%I) from %I.%I', s.col, s.sch, s.tbl) into top;
    if top is not null then perform setval(s.seq, top); end if;
  end loop;
end $$;
