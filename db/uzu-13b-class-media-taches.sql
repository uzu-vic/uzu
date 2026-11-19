-- =====================================================================================
-- UZU — Class Media : tâches planifiées (base de test uniquement)
-- Prérequis, faits par toi dans le tableau de bord de la base de TEST :
--   1. Database › Extensions : activer pg_cron et pg_net ;
--   2. ranger deux valeurs dans le coffre (Vault), en remplaçant les <...> :
--        select vault.create_secret('<secret généré par openssl rand -hex 32>', 'class_media_cron_secret');
--        select vault.create_secret('https://ntypsrdwxrkanahhuixx.supabase.co/functions/v1/class-media', 'class_media_function_url');
--   3. la fonction class-media est déployée avec le même secret (CLASS_MEDIA_CRON_SECRET).
-- Le secret n'est jamais écrit dans ce fichier ni dans le code : il est lu dans le coffre à chaque appel.
-- Les deux tâches sont un filet de sécurité : la protection des accès est faite à chaque requête.
-- =====================================================================================
create or replace function public.class_media_call(p_action text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if p_action not in ('sweep', 'purge') then raise exception 'Action inconnue'; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'class_media_cron_secret';
  if v_url is null or v_secret is null then raise exception 'Secrets Class Media absents du coffre'; end if;
  return net.http_post(url := v_url || '/' || p_action,
                       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
                       body := '{}'::jsonb, timeout_milliseconds := 60000);
end $$;
revoke all on function public.class_media_call(text) from public, anon, authenticated;

-- Rattrapage toutes les 5 minutes, purge chaque nuit à 3 h 17 (UTC)
select cron.schedule('class-media-sweep', '*/5 * * * *', $$ select public.class_media_call('sweep') $$);
select cron.schedule('class-media-purge', '17 3 * * *', $$ select public.class_media_call('purge') $$);

-- Contrôle : deux tâches actives
select jobname, schedule, active from cron.job where jobname like 'class-media-%' order by jobname;

-- RETOUR ARRIÈRE — ne pas exécuter sauf décision :
-- select cron.unschedule('class-media-sweep'); select cron.unschedule('class-media-purge');
-- drop function if exists public.class_media_call(text);
