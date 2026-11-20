do $$ declare r record; h text; begin
  create temp table if not exists _d(t text, n bigint, h text); delete from _d;
  for r in select table_schema s, table_name t from information_schema.tables where table_schema in ('public','storage') and table_type='BASE TABLE' loop
    execute format('select md5(coalesce(string_agg(x::text, ''|'' order by x::text),'''')) from %I.%I x', r.s, r.t) into h;
    execute format('insert into _d select %L, (select count(*) from %I.%I), %L', r.s||'.'||r.t, r.s, r.t, h);
  end loop; end $$;
\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
select 'D', t, n::text, h, '' from _d order by 1;
