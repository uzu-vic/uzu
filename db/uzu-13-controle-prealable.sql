-- =====================================================================================
-- UZU — Class Media : contrôle préalable, EN LECTURE SEULE (base de test uniquement)
-- À lancer avant uzu-13-class-media.sql. Ne modifie rien. Envoie le résultat à Claude.
-- Attendu : medias_existants = 0 ; journal, focus, vue_ensemble = true ; role_serveur = true ;
-- aucune règle du stockage sans filtre d'espace (bucket_id) dans regles_stockage.
-- =====================================================================================
select
  (select count(*) from public.class_session_media)                                          as medias_existants,
  exists (select 1 from pg_proc where proname = 'journal_feed')                               as journal,
  exists (select 1 from pg_proc where proname = 'group_focus_board')                          as focus,
  exists (select 1 from pg_proc where proname = 'journal_overview')                           as vue_ensemble,
  exists (select 1 from pg_roles where rolname = 'service_role')                              as role_serveur,
  (select json_agg(json_build_object('nom', policyname, 'commande', cmd, 'roles', roles,
                                     'condition', coalesce(qual, ''), 'controle', coalesce(with_check, ''))
                   order by policyname)
     from pg_policies where schemaname = 'storage' and tablename = 'objects')                 as regles_stockage,
  (select json_agg(json_build_object('id', id, 'public', public, 'taille_max', file_size_limit) order by id)
     from storage.buckets)                                                                    as espaces,
  (select json_agg(json_build_object('nom', name, 'installee', installed_version is not null) order by name)
     from pg_available_extensions where name in ('pg_cron', 'pg_net', 'supabase_vault'))     as extensions;
