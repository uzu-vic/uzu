-- =====================================================================================
-- UZU — PRODUCTION, jour J, étape 1 bis : INSTANTANÉ AVANT DÉPLOIEMENT (à lancer juste avant uzu-9)
-- PRÉPARÉ, NON EXÉCUTÉ. À lancer seulement après l'autorisation de mise en production.
--
-- Ce que fait ce script : il enregistre, dans un schéma technique « uzu_deploy » (aucune donnée d'adhérent),
--   - la liste de toutes les fonctions, tables et règles d'accès existantes avant le déploiement ;
--   - le texte exact (définition) de chaque fonction existante, avec ses droits.
-- Pourquoi : le retour arrière sans perte (uzu-pR2) s'en sert pour remettre les fonctions existantes
-- EXACTEMENT comme avant, et pour savoir ce qui a été ajouté, SANS effacer aucune donnée.
-- Ne modifie rien d'existant. Rejouable : un nouvel instantané remplace le précédent seulement si
-- aucun déploiement n'a encore eu lieu (sinon il refuse, pour ne pas écraser la référence).
-- =====================================================================================
begin;
create schema if not exists uzu_deploy;
revoke all on schema uzu_deploy from public, anon, authenticated;
create table if not exists uzu_deploy.snapshot (
  kind text not null,               -- function | table | policy | bucket | meta
  name text not null,
  definition text,
  acl text,
  taken_at timestamptz not null default now(),
  primary key (kind, name)
);
revoke all on uzu_deploy.snapshot from public, anon, authenticated;

do $$ begin
  if to_regprocedure('public.journal_save_session(uuid,jsonb,boolean)') is not null
     or to_regclass('public.club_lib_items') is not null
     or to_regclass('public.class_media_tickets') is not null
     or to_regclass('public.club_lib_videos') is not null then
    raise exception 'Arrêt : la Bibliothèque, le Journal ou Class Media sont déjà installés. L''instantané doit être pris AVANT le déploiement.';
  end if;
end $$;

delete from uzu_deploy.snapshot;
insert into uzu_deploy.snapshot (kind, name, definition, acl)
select 'function', p.oid::regprocedure::text, pg_get_functiondef(p.oid), coalesce(p.proacl::text, '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.prokind = 'f';
insert into uzu_deploy.snapshot (kind, name)
select 'table', table_schema || '.' || table_name from information_schema.tables
 where table_schema in ('public', 'storage') and table_type = 'BASE TABLE';
insert into uzu_deploy.snapshot (kind, name, definition)
select 'policy', schemaname || '.' || tablename || '#' || policyname, cmd from pg_policies where schemaname in ('public', 'storage');
insert into uzu_deploy.snapshot (kind, name, definition)
select 'policy_def', schemaname || '.' || tablename || '#' || policyname, md5(coalesce(qual, '') || '|' || coalesce(with_check, '') || '|' || roles::text)
  from pg_policies where schemaname in ('public', 'storage');
insert into uzu_deploy.snapshot (kind, name, definition)
select 'bucket', id, public::text from storage.buckets;
-- Fichiers du stockage pédagogique existant : empreinte (preuve qu'aucune vidéo existante n'est touchée)
insert into uzu_deploy.snapshot (kind, name, definition)
select 'videos_files', 'storage.objects#videos', md5(coalesce(string_agg(id::text || name || coalesce(metadata::text, '') || coalesce(updated_at::text, ''), '|' order by name), ''))
  from storage.objects where bucket_id = 'videos';
insert into uzu_deploy.snapshot (kind, name, definition) values ('meta', 'pris_le', now()::text);
commit;

-- Contrôle : nombre d'éléments enregistrés par type
select kind, count(*) from uzu_deploy.snapshot group by kind order by kind;
