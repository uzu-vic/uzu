\pset format unaligned
\pset tuples_only on
\pset fieldsep '|'
select 'F', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', md5(pg_get_functiondef(p.oid)), p.prosecdef::text, coalesce(p.proacl::text,'') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','storage') and p.prokind in ('f','p') order by 2;
select 'P', schemaname||'.'||tablename||'#'||policyname, cmd||' '||array_to_string(roles,','), md5(coalesce(qual,'')||'|'||coalesce(with_check,'')), permissive from pg_policies where schemaname in ('public','storage') order by 2;
select 'T', table_schema||'.'||table_name||'.'||column_name, data_type, coalesce(column_default,''), is_nullable from information_schema.columns where table_schema in ('public','storage') order by 2;
select 'G', table_schema||'.'||table_name||'@'||grantee, string_agg(privilege_type, ',' order by privilege_type), '', '' from information_schema.role_table_grants where table_schema in ('public','storage') and grantee in ('anon','authenticated','service_role','public','PUBLIC') group by 2 order by 2;
select 'R', c.relnamespace::regnamespace||'.'||c.relname||'#'||t.tgname, md5(pg_get_triggerdef(t.oid)), t.tgenabled::text, '' from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace::regnamespace::text in ('public','storage') order by 2;
select 'S', c.relnamespace::regnamespace||'.'||c.relname, c.relrowsecurity::text||'/'||c.relforcerowsecurity::text, '', '' from pg_class c where c.relkind='r' and c.relnamespace::regnamespace::text in ('public','storage') order by 2;
select 'B', id, public::text, '', '' from storage.buckets order by 2;
select 'V', schemaname||'.'||viewname, md5(definition), '', '' from pg_views where schemaname='public' order by 2;
