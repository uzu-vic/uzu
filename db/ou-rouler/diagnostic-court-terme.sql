-- =====================================================================================
-- UZU — « Où rouler ? » étape 2 : DIAGNOSTIC « court terme » sur la base de TEST (ou la réplique locale)
-- Observe le comportement réel des fonctions serveur avec deux personnes FICTIVES (A et B), puis ANNULE TOUT.
-- Ne modifie rien : aucune personne, aucun profil, aucune disponibilité ne reste.
-- =====================================================================================
create or replace function pg_temp.dg_as(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then perform set_config('role', 'none', true); perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  else perform set_config('request.jwt.claim.sub', p_uid::text, true); perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true); perform set_config('role', 'authenticated', true); end if;
end $$;
create or replace function pg_temp.dg_j(p_uid uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb; begin perform pg_temp.dg_as(p_uid); execute p_sql into v; perform pg_temp.dg_as(null); return v;
exception when others then perform pg_temp.dg_as(null); return jsonb_build_object('erreur', sqlerrm); end $$;
create or replace function pg_temp.dg_names(p_uid uuid, p_sql text) returns text language sql as $$
  select coalesce((select string_agg(x->>'name', ', ' order by x->>'name') from jsonb_array_elements(pg_temp.dg_j(p_uid, p_sql)->'results') x), 'aucun')
$$;

create or replace function pg_temp.dg_run() returns jsonb language plpgsql as $f$
declare out jsonb := '[]'; A uuid := gen_random_uuid(); B uuid := gen_random_uuid(); tag text := left(replace(gen_random_uuid()::text, '-', ''), 8);
  dow_paris int := (extract(isodow from (now() at time zone 'Europe/Paris'))::int - 1);   -- 0 = lundi, comme l'application
  other_day int := ((extract(isodow from (now() at time zone 'Europe/Paris'))::int) % 7); -- un autre jour que aujourd'hui
  act text := '{"adult":true,"consent":true,"safety":true,"disciplines":["jjb_gi"],"intensities":["modere"],"visibility":"uzu"}';
  j jsonb; cols text; n_before int;
begin
  select count(*) into n_before from public.rouler_availabilities;
  out := out || jsonb_build_array(jsonb_build_object('point', '0', 'constat',
    format('Heure du serveur : fuseau %s ; date serveur %s ; date à Paris %s ; heure à Paris %s', current_setting('TimeZone'), current_date,
           (now() at time zone 'Europe/Paris')::date, to_char(now() at time zone 'Europe/Paris', 'HH24:MI'))));
  select string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) into cols
    from information_schema.columns where table_schema = 'public' and table_name = 'rouler_availabilities';
  out := out || jsonb_build_array(jsonb_build_object('point', '3', 'constat', 'Colonnes de la table des disponibilités : ' || cols));
  select pg_get_function_identity_arguments('public.rouler_search'::regproc) into cols;
  out := out || jsonb_build_array(jsonb_build_object('point', '2-4', 'constat', 'Paramètres de la recherche : ' || cols));
  begin
    insert into auth.users (id, email, raw_user_meta_data) values
      (A, 'dg-' || tag || '-a@uzu.invalid', '{"name":"Alice Diag"}'), (B, 'dg-' || tag || '-b@uzu.invalid', '{"name":"Bruno Diag"}');
    -- A : ville habituelle Grigny ; B : ville habituelle Lyon
    perform pg_temp.dg_j(A, format('select public.rouler_activate(%L::jsonb)', (act::jsonb || '{"home_insee":"91286"}')::text));
    perform pg_temp.dg_j(B, format('select public.rouler_activate(%L::jsonb)', (act::jsonb || '{"home_insee":"69123"}')::text));

    -- Point 1 : une heure de début envoyée au serveur est-elle conservée ?
    j := pg_temp.dg_j(A, format('select public.rouler_save_availability(%L::jsonb)', jsonb_build_object(
      'starts_on', current_date, 'ends_on', current_date, 'starts_at', to_char(now() + interval '30 minutes', 'HH24:MI'),
      'days', jsonb_build_array(other_day), 'parts', '["matin"]'::jsonb, 'disciplines', '["jjb_gi"]'::jsonb, 'intensities', '["modere"]'::jsonb, 'places', '["club"]'::jsonb)));
    out := out || jsonb_build_array(jsonb_build_object('point', '1', 'constat',
      'A envoie « dans 30 min » (heure de début). Le serveur enregistre seulement : ' || coalesce((((j->'availabilities')->0) - 'id' - 'insee' - 'note' - 'places' - 'intensities' - 'disciplines')::text, j::text)));

    -- B : disponible aujourd'hui, mais un AUTRE jour de la semaine et le SOIR (aucun chevauchement réel avec A, qui est le matin d'un autre jour)
    perform pg_temp.dg_j(B, format('select public.rouler_save_availability(%L::jsonb)', jsonb_build_object(
      'is_travel', true, 'insee', '91286', 'starts_on', current_date, 'ends_on', current_date + 6,
      'days', jsonb_build_array(dow_paris), 'parts', '["soir"]'::jsonb, 'disciplines', '["jjb_gi"]'::jsonb, 'intensities', '["modere"]'::jsonb, 'places', '["club"]'::jsonb)));
    out := out || jsonb_build_array(jsonb_build_object('point', '2-4', 'constat',
      'A (matin, un autre jour que aujourd''hui) cherche à Grigny pour aujourd''hui seulement. Trouvé(s) : '
      || pg_temp.dg_names(A, format('select public.rouler_search(''91286'', 10, %L::date, %L::date)', current_date, current_date))
      || ' — B est disponible le soir. Les jours et moments ne sont pas comparés, aucune durée commune n''est calculée.'));
    out := out || jsonb_build_array(jsonb_build_object('point', '5', 'constat',
      'B cherche « maintenant » (aujourd''hui) à Grigny. Trouvé(s) : '
      || pg_temp.dg_names(B, format('select public.rouler_search(''91286'', 10, %L::date, %L::date)', current_date, current_date))
      || ' — alors que A est disponible le matin d''un autre jour.'));

    -- Point 6 : expiration
    update public.rouler_availabilities set ends_on = current_date - 1, starts_on = current_date - 2 where user_id = A;
    out := out || jsonb_build_array(jsonb_build_object('point', '6', 'constat',
      'Disponibilité de A terminée hier, avant tout passage de la tâche planifiée. Trouvé(s) par B : '
      || pg_temp.dg_names(B, format('select public.rouler_search(''91286'', 10, %L::date, %L::date)', current_date, current_date))
      || ' — exclue d''office par la recherche. Une disponibilité qui finit aujourd''hui reste visible jusqu''à minuit, heure du serveur.'));

    -- Point 7 : déplacement de B (habite Lyon) à Bordeaux
    perform pg_temp.dg_j(B, format('select public.rouler_save_availability(%L::jsonb)', jsonb_build_object(
      'is_travel', true, 'insee', '33063', 'starts_on', current_date, 'ends_on', current_date + 2,
      'days', '[0,1,2,3,4,5,6]'::jsonb, 'parts', '["soir"]'::jsonb, 'disciplines', '["jjb_gi"]'::jsonb, 'intensities', '["modere"]'::jsonb, 'places', '["club"]'::jsonb)));
    update public.rouler_availabilities set ends_on = current_date + 1, starts_on = current_date where user_id = A;
    update public.rouler_profiles set home_insee = '33063' where user_id = A;   -- A habite Bordeaux pour l'exemple
    update public.rouler_availabilities set insee = '33063' where user_id = A;
    out := out || jsonb_build_array(jsonb_build_object('point', '7', 'constat',
      'B (ville habituelle Lyon) déclare une disponibilité à Bordeaux. Ville habituelle de B ensuite : '
      || (select g.nom from public.rouler_profiles p join public.geo_communes g on g.insee = p.home_insee where p.user_id = B)
      || ' ; B trouvé par A en cherchant à Bordeaux : ' || pg_temp.dg_names(A, 'select public.rouler_search(''33063'', 10)')
      || ' ; en cherchant à Lyon : ' || pg_temp.dg_names(A, 'select public.rouler_search(''69123'', 10)')
      || ' ; B cherche à Bordeaux (sa recherche n''utilise pas sa ville habituelle) : ' || pg_temp.dg_names(B, 'select public.rouler_search(''33063'', 10)')));
    raise exception using message = 'dg_annulation';
  exception when others then
    if sqlerrm <> 'dg_annulation' then out := out || jsonb_build_array(jsonb_build_object('point', '!', 'constat', 'ERREUR : ' || sqlerrm)); end if;
  end;
  out := out || jsonb_build_array(jsonb_build_object('point', 'Fin', 'constat',
    'Annulation : personnes fictives restantes = ' || (select count(*) from auth.users where email like 'dg-' || tag || '-%')
    || ' ; disponibilités avant/après = ' || n_before || '/' || (select count(*) from public.rouler_availabilities)));
  return out;
end $f$;

select pg_temp.dg_run() as diagnostic;
