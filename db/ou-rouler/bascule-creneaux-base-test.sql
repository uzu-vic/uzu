-- =====================================================================================
-- UZU — « Où rouler ? » étape 2 : BASCULE de la base de TEST vers les créneaux horodatés (révision C1 à C7)
-- À exécuter UNE FOIS, sur la base de TEST seulement, juste AVANT db/uzu-14b-rouler.sql (version révisée).
-- Refuse de tourner hors de la base de test, ou s'il existe la moindre disponibilité enregistrée.
-- Supprime seulement l'ancienne table des disponibilités (vide) et l'ancienne fonction de recherche.
-- Profils de roulage, signalements, journal des recherches et blocages ne sont pas touchés.
-- =====================================================================================
do $$
declare v_url text; n int;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' then raise exception 'Arrêt : pas la base de test'; end if;
  if to_regclass('public.rouler_availabilities') is null then raise notice 'Rien à basculer'; return; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rouler_availabilities' and column_name = 'starts_at') then
    raise notice 'Déjà au nouveau format'; return;
  end if;
  select count(*) into n from public.rouler_availabilities;
  if n > 0 then raise exception 'Arrêt : % disponibilité(s) enregistrée(s), bascule refusée', n; end if;
  drop function if exists public.rouler_search(text, int, date, date, text, text, text, text);
  drop table public.rouler_availabilities;
  raise notice 'Bascule faite : exécuter maintenant db/uzu-14b-rouler.sql';
end $$;
