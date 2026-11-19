-- =====================================================================================
-- UZU — Class Media : vérification du secret des tâches planifiées PAR LA BASE (base de test uniquement)
-- Pourquoi : la copie du secret gardée par la fonction (CLASS_MEDIA_CRON_SECRET) ne suivait pas les
-- modifications faites dans le tableau de bord. Désormais le secret n'existe qu'à un seul endroit, le coffre
-- (Vault). La fonction envoie l'empreinte SHA-256 de ce qu'elle reçoit ; la base la compare à celle du secret.
-- La valeur du secret ne transite jamais en clair entre la fonction et la base, et n'est jamais renvoyée.
-- Seul le rôle serveur (utilisé par la fonction) peut appeler cette vérification.
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
