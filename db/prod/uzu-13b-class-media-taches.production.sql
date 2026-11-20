-- =====================================================================================
-- UZU — Class Media : tâches planifiées — VERSION PRODUCTION (ixkewdxtuhxfiodwhhzr)
-- PRÉPARÉ, NON EXÉCUTÉ. Étape 7 du plan, après uzu-13c et après le déploiement de la fonction class-media.
-- Prérequis, dans le tableau de bord du projet de PRODUCTION :
--   1. Database › Extensions : pg_cron et pg_net activées ;
--   2. dans l'éditeur SQL de production, ranger les deux valeurs dans le coffre (le secret est généré par la base
--      et n'est affiché qu'à toi, une fois) :
--        with s as (select encode(extensions.gen_random_bytes(32), 'hex') v)
--        select vault.create_secret(s.v, 'class_media_cron_secret') from s;
--        select vault.create_secret('https://ixkewdxtuhxfiodwhhzr.supabase.co/functions/v1/class-media', 'class_media_function_url');
--   3. AUCUN secret à saisir dans la fonction : la vérification se fait par la base (uzu-13c).
-- Garde : ce script refuse de programmer les tâches si l'adresse rangée n'est pas celle de la PRODUCTION
-- (une production qui appellerait la fonction de test serait une erreur grave).
-- =====================================================================================
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'class_media_function_url'
                  and decrypted_secret = 'https://ixkewdxtuhxfiodwhhzr.supabase.co/functions/v1/class-media') then
    raise exception 'Arrêt : l''adresse de la fonction rangée dans le coffre n''est pas celle de la production.';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'class_media_cron_secret' and decrypted_secret ~ '^[0-9a-f]{64}$') then
    raise exception 'Arrêt : secret des tâches absent ou mal formé dans le coffre.';
  end if;
end $$;
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
