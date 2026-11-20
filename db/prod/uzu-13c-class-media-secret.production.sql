-- =====================================================================================
-- UZU — Class Media : vérification du secret des tâches par la base — VERSION PRODUCTION (ixkewdxtuhxfiodwhhzr)
-- PRÉPARÉ, NON EXÉCUTÉ. Étape 7 du plan, avant uzu-13b. Contenu identique à db/uzu-13c-class-media-secret.sql.
-- Le secret n'existe que dans le coffre de la base ; la fonction n'en garde aucune copie ; seule son empreinte
-- SHA-256 est comparée. Réservé au rôle serveur.
-- =====================================================================================
create or replace function public.class_media_cron_ok(p_hash text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = 'class_media_cron_secret';
  if v is null or v !~ '^[0-9a-f]{64}$' then return false; end if;
  return encode(extensions.digest(v, 'sha256'), 'hex') = p_hash;
end $$;
revoke all on function public.class_media_cron_ok(text) from public, anon, authenticated;
grant execute on function public.class_media_cron_ok(text) to service_role;

-- Contrôle : true, true, false, false
select
  has_function_privilege('service_role', 'public.class_media_cron_ok(text)', 'execute') as serveur_autorise,
  public.class_media_cron_ok(encode(extensions.digest(
    (select decrypted_secret from vault.decrypted_secrets where name = 'class_media_cron_secret'), 'sha256'), 'hex')) as secret_reconnu,
  has_function_privilege('anon', 'public.class_media_cron_ok(text)', 'execute') as visiteur_autorise,
  has_function_privilege('authenticated', 'public.class_media_cron_ok(text)', 'execute') as membre_autorise;

-- RETOUR ARRIÈRE — ne pas exécuter sauf décision (et redéployer la version précédente de la fonction) :
-- drop function if exists public.class_media_cron_ok(text);
