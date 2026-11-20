-- =====================================================================================
-- UZU — PRODUCTION : CONTRÔLE PRÉALABLE (LECTURE SEULE) — à lancer avant toute intervention
-- PRÉPARÉ. Ce script ne peut RIEN modifier : il s'exécute dans une transaction en lecture seule.
-- Il vérifie que la production est dans l'état attendu par les sept scripts :
--   A. modules pas encore installés (Bibliothèque, Journal, Class Media) ;
--   B. éléments existants dont les scripts dépendent : 15 fonctions, 6 tables, avec la bonne signature ;
--   C. éléments existants que les scripts modifient (3 fonctions, 1 table, l'espace de stockage des vidéos) ;
--   D. extensions nécessaires disponibles (pg_cron, pg_net, pgcrypto, coffre) ;
--   E. aucun secret Class Media déjà présent dans le coffre.
-- Résultat attendu : toutes les lignes à « ✔ ». Une seule ligne « ✖ » = on ne déploie pas, on analyse.
-- =====================================================================================
begin transaction read only;

with
deps(f) as (values
    ('public.uzu_active_academy()'),
    ('public.uzu_audit(uuid,text,text,text,jsonb)'),
    ('public.uzu_can(uuid,text,text)'),
    ('public.uzu_check_grant(uuid,jsonb)'),
    ('public.uzu_notify(uuid,text,text,text,text,text)'),
    ('public.uzu_perm_catalog()'),
    ('public.uzu_perm_scope(uuid,text,text)'),
    ('public.uzu_perm_template(text)'),
    ('public.uzu_perm_valid(text,text,text)'),
    ('public.uzu_require_auth()'),
    ('public.uzu_scope_courses(uuid,text)'),
    ('public.uzu_scope_rank(text)'),
    ('public.uzu_staff_member(uuid)'),
    ('public.uzu_staff_with(uuid,text,text[])'),
    ('public.uzu_try_uuid(text)')),
tabs(t) as (values
    ('public.academy_members'),
    ('public.academy_sections'),
    ('public.clubs'),
    ('public.course_meta'),
    ('public.docs'),
    ('public.uzu_platform_admins')),
c(n, controle, ok, detail) as (
  -- A. Modules absents
  select 'A1', 'Bibliothèque pas encore installée', to_regclass('public.club_lib_items') is null and to_regclass('public.lib_techniques') is null, ''
  union all select 'A2', 'Journal des cours pas encore installé', to_regclass('public.class_sessions') is null and to_regprocedure('public.journal_save_session(uuid,jsonb,boolean)') is null, ''
  union all select 'A3', 'Class Media pas encore installé', to_regclass('public.class_media_tickets') is null and not exists (select 1 from storage.buckets where id like 'class-media%'), ''
  union all select 'A4', 'Instantané uzu-p1 pas encore pris (ou à reprendre le jour J)', to_regclass('uzu_deploy.snapshot') is null, 'si ✖ : un instantané existe déjà, vérifier sa date'
  -- B. Dépendances
  union all select 'B1', 'Fonctions existantes nécessaires présentes avec la bonne signature (15)',
    (select count(*) from deps where to_regprocedure(f) is not null) = 15,
    coalesce((select string_agg(f, ', ') from deps where to_regprocedure(f) is null), '')
  union all select 'B2', 'Tables existantes nécessaires présentes (6)',
    (select count(*) from tabs where to_regclass(t) is not null) = 6,
    coalesce((select string_agg(t, ', ') from tabs where to_regclass(t) is null), '')
  -- C. Éléments existants modifiés par les scripts
  union all select 'C1', 'Catalogue des droits : 15 types, sans Bibliothèque ni Journal ni mineurs',
    (select count(*) from jsonb_object_keys(public.uzu_perm_catalog())) = 15 and not (public.uzu_perm_catalog() ?| array['library','class_journal','minor_groups']),
    (select count(*) from jsonb_object_keys(public.uzu_perm_catalog()))::text || ' types'
  union all select 'C2', 'Groupes (academy_sections) : pas encore de colonne « minors »',
    not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'academy_sections' and column_name = 'minors'), ''
  union all select 'C3', 'Espace des vidéos pédagogiques présent (il ne sera pas modifié)',
    exists (select 1 from storage.buckets where id = 'videos'),
    coalesce((select 'public=' || public::text from storage.buckets where id = 'videos'), 'absent')
  union all select 'C4', 'Aucune règle d''envoi Class Media déjà présente', not exists (select 1 from pg_policies where policyname = 'uzu_class_media_insert'), ''
  -- D. Extensions
  union all select 'D1', 'pg_cron disponible', exists (select 1 from pg_available_extensions where name = 'pg_cron'),
    coalesce((select 'installée ' || installed_version from pg_available_extensions where name = 'pg_cron' and installed_version is not null), 'à activer')
  union all select 'D2', 'pg_net disponible', exists (select 1 from pg_available_extensions where name = 'pg_net'),
    coalesce((select 'installée ' || installed_version from pg_available_extensions where name = 'pg_net' and installed_version is not null), 'à activer')
  union all select 'D3', 'pgcrypto installée dans le schéma extensions', exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto' and n.nspname = 'extensions'), ''
  union all select 'D4', 'Coffre (Vault) disponible', to_regclass('vault.decrypted_secrets') is not null, ''
  -- E. Coffre
  union all select 'E1', 'Aucun secret Class Media déjà rangé dans le coffre',
    to_regclass('vault.decrypted_secrets') is not null and not exists (select 1 from vault.secrets where name like 'class_media_%'), ''
)
select n as num, controle, case when ok then '✔' else '✖' end as resultat, detail from c order by n;

-- Informations (sans donnée personnelle) : volume des tables existantes concernées
select 'info' as type, relname as table_existante, n_live_tup as lignes_estimees
  from pg_stat_user_tables where schemaname = 'public' and relname in ('academy_members','academy_sections','clubs','course_meta','docs')
 order by 2;

rollback;
