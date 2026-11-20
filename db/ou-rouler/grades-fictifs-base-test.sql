-- =====================================================================================
-- UZU — « Où rouler ? » étape 2, décision D10 : ceintures FICTIVES sur les 4 comptes de la base de TEST,
-- pour essayer le filtre de niveau et l'affichage de la ceinture. Refuse de tourner hors de la base de test.
-- N'écrase aucune ceinture existante (ajout seulement). Chaque document porte "fictif": true.
-- RETRAIT : exécuter le bloc en bas du fichier (supprime seulement ces documents fictifs).
-- =====================================================================================
do $$
declare v_url text; n int;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' then raise exception 'Arrêt : pas la base de test'; end if;
  insert into public.docs (path, data)
  select 'grades/' || a.id, jsonb_build_object('rank', g.rank, 'stripes', g.stripes, 'since', '2026-11-20', 'fictif', true)
    from auth.users a join (values ('d63ba8b2', 'noire', 1), ('97335801', 'bleue', 2), ('13fbc893', 'violette', 0), ('701601a1', 'marron', 1)) g(pfx, rank, stripes)
      on left(a.id::text, 8) = g.pfx
  on conflict (path) do nothing;
  get diagnostics n = row_count;
  raise notice 'ceintures fictives ajoutées : %', n;
end $$;
select left(replace(path, 'grades/', ''), 8) as compte, data->>'rank' as ceinture, data->>'stripes' as barrettes, data->>'fictif' as fictif
  from public.docs where path like 'grades/%' order by 1;

-- RETRAIT (à exécuter seul pour revenir en arrière) :
-- delete from public.docs where path like 'grades/%' and data->>'fictif' = 'true';
