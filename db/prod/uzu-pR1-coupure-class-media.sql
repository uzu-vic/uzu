-- =====================================================================================
-- UZU — PRODUCTION : COUPURE IMMÉDIATE DE CLASS MEDIA (niveau 2 du plan, incident de sécurité)
-- PRÉPARÉ, NON EXÉCUTÉ.
-- Coupe toute lecture et tout envoi de photos et vidéos de séance en quelques secondes, SANS rien effacer :
--   - tâches planifiées arrêtées ;
--   - tous les jetons de lecture en cours annulés (la fonction refuse le morceau suivant) ;
--   - plus aucun accès des comptes aux fonctions Class Media (liste, jeton, envoi, retrait…) ;
--   - règle d'envoi retirée.
-- Le Journal et la Bibliothèque continuent de fonctionner. Fichiers, médias, demandes de retrait conservés.
-- À faire en plus : supprimer ou désactiver la fonction class-media dans Supabase.
-- Réactivation : relancer uzu-13, uzu-13c puis uzu-13b (rejouables, sans effet sur les données).
-- =====================================================================================
begin;
do $$ begin if to_regclass('cron.job') is not null then perform cron.unschedule(jobname) from cron.job where jobname like 'class-media-%'; end if; end $$;
update public.class_media_tickets set revoked_at = now() where revoked_at is null;
do $$ declare r record; begin
  for r in select p.oid::regprocedure f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
              and (p.proname like 'media\_%' or p.proname like 'class\_media\_%' or p.proname like 'uzu\_media\_%'
                   or p.proname in ('session_media', 'section_minors_list', 'set_section_minors')) loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
  end loop; end $$;
drop policy if exists uzu_class_media_insert on storage.objects;
commit;

-- Contrôle : 0 fonction Class Media accessible aux comptes, 0 jeton actif, 0 tâche, pas de règle d'envoi
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
     and (p.proname like 'media\_%' or p.proname like 'class\_media\_%' or p.proname in ('session_media', 'section_minors_list', 'set_section_minors'))
     and has_function_privilege('authenticated', p.oid, 'execute')) as fonctions_accessibles,
  (select count(*) from public.class_media_tickets where revoked_at is null and expires_at > now()) as jetons_actifs,
  (select count(*) from cron.job where jobname like 'class-media-%') as taches,
  (select count(*) from pg_policies where policyname = 'uzu_class_media_insert') as regle_envoi;
