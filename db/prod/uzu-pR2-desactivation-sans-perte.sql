-- =====================================================================================
-- UZU — PRODUCTION : RETOUR ARRIÈRE SANS PERTE DE DONNÉES (Bibliothèque, Journal, Class Media)
-- PRÉPARÉ, NON EXÉCUTÉ. Ne se lance que sur décision explicite.
--
-- Principe : on remet le CODE comme avant, on GARDE TOUTES LES DONNÉES.
--   1. arrêt des tâches planifiées Class Media ;
--   2. copie gelée de toutes les tables ajoutées, dans un schéma d'archive daté (en plus des tables elles-mêmes) ;
--   3. retrait de l'accès des comptes (anon, authenticated) à TOUTES les fonctions ajoutées par le déploiement
--      (les modules deviennent inaccessibles, leurs données restent intactes) ;
--   4. retrait de la règle d'envoi Class Media (aucun nouveau fichier) ;
--   5. remise des fonctions existantes modifiées (catalogue et modèles de droits) dans leur version d'avant,
--      à partir de l'instantané uzu-p1 ;
--   6. contrôle : fonctions existantes identiques à l'instantané, données comptées avant/après.
-- Aucune table, aucune ligne, aucun fichier n'est effacé. Aucune restauration de sauvegarde n'est faite.
-- Réactivation : relancer les sept scripts dans l'ordre (ils sont rejouables et ne touchent pas aux données).
-- À faire en plus, hors SQL : remettre la version précédente du site (Vercel « Promote ») et supprimer la
-- fonction class-media dans Supabase.
-- =====================================================================================
begin;
do $$ declare n int := 0; begin
  if to_regclass('uzu_deploy.snapshot') is not null then execute 'select count(*) from uzu_deploy.snapshot where kind = ''function''' into n; end if;
  if n = 0 then raise exception 'Arrêt : instantané uzu-p1 introuvable. Sans lui, impossible de garantir un retour à l''identique.'; end if;
end $$;

-- Comptage des données avant (preuve de non-perte)
create temp table _avant (t text primary key, n bigint) on commit drop;
do $$ declare r record; v bigint; begin
  for r in select table_schema s, table_name t from information_schema.tables
            where table_schema = 'public' and table_type = 'BASE TABLE'
              and (table_schema || '.' || table_name) not in (select name from uzu_deploy.snapshot where kind = 'table') loop
    execute format('select count(*) from %I.%I', r.s, r.t) into v; insert into _avant values (r.t, v);
  end loop; end $$;

-- 1. Tâches planifiées
do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobname) from cron.job where jobname like 'class-media-%';
  end if;
end $$;

-- 2. Copie gelée des tables ajoutées
do $$ declare r record; sch text := 'uzu_archive_' || to_char(now(), 'YYYYMMDD_HH24MI'); begin
  execute format('create schema if not exists %I', sch);
  execute format('revoke all on schema %I from public, anon, authenticated', sch);
  for r in select t from _avant loop
    execute format('create table %I.%I as table public.%I', sch, r.t, r.t);
  end loop;
  raise notice 'Archive créée : %', sch;
end $$;

-- 3. Fonctions ajoutées : plus aucun accès pour les comptes (le rôle serveur garde l'accès)
do $$ declare r record; begin
  for r in select p.oid::regprocedure as f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
              and p.oid::regprocedure::text not in (select name from uzu_deploy.snapshot where kind = 'function') loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
  end loop; end $$;

-- 4. Règles de stockage ajoutées par le déploiement (Class Media, vidéos de la Bibliothèque) :
--    toute règle du stockage absente de l'instantané est retirée ; les règles existantes ne sont pas touchées
drop policy if exists uzu_class_media_insert on storage.objects;
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and ('storage.objects#' || policyname) not in (select name from uzu_deploy.snapshot where kind = 'policy') loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'Règle de stockage retirée : %', r.policyname;
  end loop; end $$;

-- 5. Fonctions existantes : retour à la définition et aux droits exacts d'avant
do $$ declare r record; cur text; begin
  for r in select s.name, s.definition, s.acl from uzu_deploy.snapshot s where s.kind = 'function' loop
    select pg_get_functiondef(r.name::regprocedure) into cur;
    if cur is distinct from r.definition then
      execute r.definition;
      raise notice 'Fonction remise comme avant : %', r.name;
    end if;
  end loop; end $$;

-- 6. Contrôles
do $$ declare r record; v bigint; diff int := 0; begin
  for r in select t, n from _avant loop
    execute format('select count(*) from public.%I', r.t) into v;
    if v <> r.n then raise exception 'Arrêt : la table % a changé de nombre de lignes (% → %)', r.t, r.n, v; end if;
  end loop;
  select count(*) into diff from uzu_deploy.snapshot s
   where s.kind = 'function' and pg_get_functiondef(s.name::regprocedure) is distinct from s.definition;
  if diff > 0 then raise exception 'Arrêt : % fonction(s) existante(s) différente(s) de l''instantané', diff; end if;
end $$;
commit;

-- Résultat : données conservées et fonctions existantes identiques à l'instantané
select 'donnees_conservees' as controle, count(*) as tables, sum(n) as lignes from (
  select (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint n
    from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'
     and ('public.' || table_name) not in (select name from uzu_deploy.snapshot where kind = 'table')) x
union all
select 'fonctions_existantes_identiques', count(*), null from uzu_deploy.snapshot s
 where s.kind = 'function' and pg_get_functiondef(s.name::regprocedure) = s.definition
union all
select 'fonctions_ajoutees_accessibles_aux_comptes', count(*), null from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f'
   and p.oid::regprocedure::text not in (select name from uzu_deploy.snapshot where kind = 'function')
   and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
union all
select 'regles_stockage_ajoutees_restantes', count(*), null from pg_policies
 where schemaname = 'storage' and ('storage.' || tablename || '#' || policyname) not in (select name from uzu_deploy.snapshot where kind = 'policy');
