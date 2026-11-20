-- =====================================================================================
-- UZU — PRODUCTION : CONTRÔLE APRÈS DÉPLOIEMENT (LECTURE SEULE) — étape 9 du plan, essai P1
-- PRÉPARÉ. Ce script ne peut RIEN modifier : transaction en lecture seule. Il ne crée aucune donnée,
-- même fictive (à la différence de uzu-13d, réservé à la base de test).
-- Compare l'état de la production à l'instantané uzu-p1 pris juste avant le déploiement.
-- Résultat attendu : toutes les lignes à « ✔ ». Une ligne « ✖ » sur la sécurité = coupure (uzu-pR1).
-- =====================================================================================
begin transaction read only;  -- toute écriture serait refusée par PostgreSQL

with
nouvelles(t) as (values
  ('academy_group_members'), ('class_media_removal_requests'), ('class_media_settings'), ('class_media_tickets'),
  ('class_session_events'), ('class_session_media'), ('class_session_techniques'), ('class_sessions'),
  ('club_lib_collection_items'), ('club_lib_collections'), ('club_lib_events'), ('club_lib_hidden'), ('club_lib_items'),
  ('club_lib_settings'), ('club_lib_technique_details'), ('group_focus'), ('lib_categories'), ('lib_disciplines'),
  ('lib_flow_step_techniques'), ('lib_flow_steps'), ('lib_flows'), ('lib_techniques'), ('club_lib_videos')),
serveur(f) as (values
  ('public.media_stream_check(text)'), ('public.media_finalize_info(uuid,uuid)'), ('public.media_mark_ready(uuid,text,bigint)'),
  ('public.media_mark_failed(uuid,text)'), ('public.media_set_location(uuid,text)'), ('public.media_reconcile(uuid,integer)'),
  ('public.media_purge()'), ('public.class_media_cron_ok(text)'), ('public.class_media_call(text)')),
snap as (select * from uzu_deploy.snapshot),
c(n, controle, ok, detail) as (
  select 'S0', 'Instantané uzu-p1 présent (référence du retour arrière)', exists (select 1 from snap where kind = 'function'),
         coalesce((select definition from snap where kind = 'meta' and name = 'pris_le'), '')
  -- Existant préservé
  union all select 'X1', 'Toutes les tables existantes avant le déploiement sont toujours là',
    not exists (select 1 from snap where kind = 'table' and to_regclass(name) is null), ''
  union all select 'X2', 'Toutes les règles d''accès existantes sont toujours là',
    not exists (select 1 from snap s where kind = 'policy' and not exists (select 1 from pg_policies p where p.schemaname || '.' || p.tablename || '#' || p.policyname = s.name)), ''
  union all select 'X3', 'Fonctions existantes : seules uzu_perm_catalog et uzu_perm_template ont changé (attendu)',
    (select coalesce(array_agg(name order by name), '{}') from snap where kind = 'function'
      and (to_regprocedure(name) is null or pg_get_functiondef(name::regprocedure) is distinct from definition))
      <@ array['uzu_perm_catalog()', 'uzu_perm_template(text)'],
    coalesce((select string_agg(name, ', ') from snap where kind = 'function'
      and (to_regprocedure(name) is null or pg_get_functiondef(name::regprocedure) is distinct from definition)), '')
  union all select 'X4', 'Catalogue des droits : les 15 types existants sont toujours présents',
    (select count(*) from jsonb_object_keys(public.uzu_perm_catalog()) k where k in
      ('belts','courses','contents','schedule','sessions','students','dashboard','attendance','instructors','progression',
       'communications','academy_settings','pedagogical_notes','academy_audit_logs','academy_statistics')) = 15, ''
  union all select 'X5', 'Espace des vidéos pédagogiques inchangé',
    (select public::text from storage.buckets where id = 'videos') is not distinct from (select definition from snap where kind = 'bucket' and name = 'videos'), ''
  union all select 'X6', 'Vidéos pédagogiques existantes : fichiers identiques (hors sous-dossiers Bibliothèque <club>/lib/)',
    (select md5(coalesce(string_agg(id::text || name || coalesce(metadata::text, '') || coalesce(updated_at::text, ''), '|' order by name), '')) from storage.objects
      where bucket_id = 'videos' and name not like '%/lib/%') is not distinct from (select definition from snap where kind = 'videos_files'), ''
  union all select 'X7', 'Règles d''accès existantes : définitions identiques (lecture, envoi, suppression)',
    not exists (select 1 from snap s join pg_policies p on p.schemaname || '.' || p.tablename || '#' || p.policyname = s.name
      where s.kind = 'policy_def' and md5(coalesce(p.qual, '') || '|' || coalesce(p.with_check, '') || '|' || p.roles::text) <> s.definition),
    coalesce((select string_agg(s.name, ', ') from snap s join pg_policies p on p.schemaname || '.' || p.tablename || '#' || p.policyname = s.name
      where s.kind = 'policy_def' and md5(coalesce(p.qual, '') || '|' || coalesce(p.with_check, '') || '|' || p.roles::text) <> s.definition), '')
  -- Installation
  union all select 'I1', 'Les 23 nouvelles tables existent, règles d''accès (RLS) activées',
    (select count(*) from nouvelles n join pg_class c on c.relname = n.t and c.relnamespace = 'public'::regnamespace where c.relrowsecurity) = 23, ''
  union all select 'I2', 'Deux espaces Class Media privés, 50 Mo au plus',
    (select count(*) from storage.buckets where id in ('class-media', 'class-media-quarantine') and not public and file_size_limit = 52428800) = 2, ''
  union all select 'I3', 'Deux tâches planifiées actives (rattrapage 5 min, purge nocturne)',
    (select count(*) from cron.job where jobname in ('class-media-sweep', 'class-media-purge') and active) = 2, ''
  union all select 'I4', 'Coffre : adresse de la fonction = production, secret présent (non affiché)',
    exists (select 1 from vault.decrypted_secrets where name = 'class_media_function_url' and decrypted_secret = 'https://ixkewdxtuhxfiodwhhzr.supabase.co/functions/v1/class-media')
    and exists (select 1 from vault.decrypted_secrets where name = 'class_media_cron_secret' and decrypted_secret ~ '^[0-9a-f]{64}$'), ''
  -- Sécurité
  union all select 'Z1', 'Aucune fonction ajoutée n''est accessible sans connexion (anon)',
    not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.prokind = 'f'
      and p.oid::regprocedure::text not in (select name from snap where kind = 'function') and has_function_privilege('anon', p.oid, 'execute')),
    coalesce((select string_agg(p.oid::regprocedure::text, ', ') from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.prokind = 'f'
      and p.oid::regprocedure::text not in (select name from snap where kind = 'function') and has_function_privilege('anon', p.oid, 'execute')), '')
  union all select 'Z2', 'Fonctions réservées au serveur : inaccessibles aux comptes connectés (9)',
    (select count(*) from serveur where to_regprocedure(f) is not null and not has_function_privilege('authenticated', to_regprocedure(f), 'execute')) = 9,
    coalesce((select string_agg(f, ', ') from serveur where to_regprocedure(f) is null or has_function_privilege('authenticated', to_regprocedure(f), 'execute')), '')
  union all select 'Z3', 'Aucune lecture directe des fichiers Class Media (aucune règle de lecture, donc aucun lien signé)',
    not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
      and (coalesce(qual, '') like '%class-media%' or coalesce(with_check, '') like '%class-media%')), ''
  union all select 'Z4', 'Règle d''envoi limitée à l''espace class-media et à l''emplacement réservé',
    exists (select 1 from pg_policies where policyname = 'uzu_class_media_insert' and cmd = 'INSERT'
      and with_check like '%class-media%' and with_check like '%uzu_media_upload_ok%'), ''
  union all select 'Z6', 'Vidéos Bibliothèque : 2 règles de stockage ajoutées, limitées à « videos » et aux fichiers déclarés',
    (select count(*) from pg_policies where schemaname = 'storage' and (
        (policyname = 'uzu_lib_video_insert' and cmd = 'INSERT' and with_check like '%''videos''%' and with_check like '%uzu_lib_video_upload_ok%')
     or (policyname = 'uzu_lib_video_delete' and cmd = 'DELETE' and qual like '%''videos''%' and qual like '%uzu_lib_video_delete_ok%'))) = 2
    and not exists (select 1 from pg_policies where policyname like 'uzu_lib_video%' and coalesce(qual, '') || coalesce(with_check, '') like '%class-media%'), ''
  union all select 'Z7', 'Table des vidéos Bibliothèque : aucune écriture directe pour les comptes',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'club_lib_videos'
      and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE')), ''
  union all select 'Z5', 'Tables Class Media sensibles (jetons, demandes, réglages) fermées aux comptes',
    not exists (select 1 from information_schema.role_table_grants where table_schema = 'public'
      and table_name in ('class_media_tickets', 'class_media_removal_requests', 'class_media_settings') and grantee in ('anon', 'authenticated')), ''
)
select n as num, controle, case when ok then '✔' else '✖' end as resultat, detail from c order by n;
-- Pas de « commit » : la transaction en lecture seule est abandonnée à la fin de la connexion (rien ne peut être écrit).
