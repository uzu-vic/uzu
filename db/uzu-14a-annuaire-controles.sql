-- =====================================================================================
-- UZU — « Où rouler ? » étape 1, annuaire privé (uzu-14a) : CONTRÔLES sur la base de TEST, sans compte réel
-- À coller en entier dans l'éditeur SQL de la base de TEST (ntypsrdwxrkanahhuixx), APRÈS uzu-14a0 et uzu-14a.
--   1. crée des personnes et des clubs FICTIFS (responsable, professeur, élève, indépendant, autre club,
--      membre de deux clubs, équipe UZU) ;
--   2. se met dans la peau de chacun et vérifie ce qu'il peut voir ou faire ;
--   3. ANNULE TOUT à la fin : la dernière ligne le vérifie, et vérifie que les clubs et adhésions
--      existants sont identiques avant et après.
-- Refuse de tourner hors de la base de test.
-- =====================================================================================

create or replace function pg_temp.da_as(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then
    perform set_config('role', 'none', true); perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;
create or replace function pg_temp.da_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform set_config('role', 'anon', true); end $$;
create or replace function pg_temp.da_j(p_uid uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb; begin perform pg_temp.da_as(p_uid); execute p_sql into v; perform pg_temp.da_as(null); return v; end $$;
create or replace function pg_temp.da_err(p_uid uuid, p_sql text) returns text language plpgsql as $$
begin perform pg_temp.da_as(p_uid); execute p_sql; perform pg_temp.da_as(null); return null;
exception when others then return coalesce(nullif(sqlerrm, ''), 'refusé'); end $$;
create or replace function pg_temp.da_anon_err(p_sql text) returns text language plpgsql as $$
begin perform pg_temp.da_anon(); execute p_sql; perform pg_temp.da_as(null); return null;
exception when others then return coalesce(nullif(sqlerrm, ''), 'refusé'); end $$;
create or replace function pg_temp.da_l(p_n text, p_test text, p_ok boolean, p_detail text default '') returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('n', p_n, 'test', p_test, 'ok', coalesce(p_ok, false), 'detail', case when coalesce(p_ok, false) then '' else left(coalesce(p_detail, ''), 200) end))
$$;
create or replace function pg_temp.da_snap() returns text language sql as $$
  select md5(coalesce((select string_agg(id::text || name || coalesce(schedule::text, '') || coalesce(profile::text, ''), '|' order by id) from public.clubs), '')
          || coalesce((select string_agg(academy_id::text || user_id::text || role || status, '|' order by academy_id, user_id) from public.academy_members), '')
          || coalesce((select string_agg(user_id::text || coalesce(club_id::text, ''), '|' order by user_id) from public.profiles), ''))
$$;

create or replace function pg_temp.da_controle() returns table (num text, test text, resultat text, detail text)
language plpgsql as $f$
declare
  v_res jsonb := '[]'; v_url text; v_tag text := left(replace(gen_random_uuid()::text, '-', ''), 8); v_before text := pg_temp.da_snap();
  A uuid := gen_random_uuid(); I1 uuid := gen_random_uuid(); B1 uuid := gen_random_uuid(); X1 uuid := gen_random_uuid();
  D1 uuid := gen_random_uuid(); M2 uuid := gen_random_uuid(); P uuid := gen_random_uuid();
  CA uuid; CD uuid; j jsonb; e text; v_slug text; v_sched text; v_staff text; n int;
  ok_save text := '{"name":"DA Club test","insee":"91286","address":"Gymnase des Tests, Grigny","disciplines":["jjb_gi","grappling_nogi"],"description":"Club fictif de contrôle","website":"https://exemple.invalid","phone":"01 23 45 67 89","email":"club@exemple.invalid","welcome":{"price":"10 €","license":"Licence ou assurance demandée","contact_first":true},"published":true,"slots":[{"id":"t1","kind":"open_mat","price":"10 €"},{"id":"t2","kind":"open_class"}]}';
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' then
    return query select '!'::text, 'Arrêt : cette base n''est pas reconnue comme la base de test. Rien n''a été fait.'::text, '✖'::text, ''::text; return;
  end if;
  if to_regprocedure('public.dir_search(text,integer,text,text,integer)') is null or (select count(*) from public.geo_communes) < 30000 then
    return query select '!'::text, 'Arrêt : uzu-14a0 (communes chargées) et uzu-14a doivent être installés.'::text, '✖'::text, ''::text; return;
  end if;

  begin   -- ======== tout ce bloc est annulé à la fin ========
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 'da-test-' || v_tag || '-' || s || '@uzu.invalid', jsonb_build_object('name', 'DA test ' || s)
  from (values (A, 'resp'), (I1, 'prof'), (B1, 'eleve'), (X1, 'solo'), (D1, 'autreclub'), (M2, 'deuxclubs'), (P, 'equipeuzu')) t(u, s);
  perform pg_temp.da_j(A, format('select public.create_new_club(%L, %L)', 'DA test ' || v_tag, upper('DAT-' || v_tag)));
  perform pg_temp.da_j(D1, format('select public.create_new_club(%L, %L)', 'DA autre ' || v_tag, upper('DAA-' || v_tag)));
  select academy_id into CA from public.academy_members where user_id = A;
  select academy_id into CD from public.academy_members where user_id = D1;
  update public.clubs set schedule = '[{"id":"t1","d":5,"s":"11:00","e":"13:00","t":"Open mat","kind":"open","disc":"grappling"},{"id":"t2","d":2,"s":"19:00","e":"20:30","t":"No-Gi adultes","kind":"cours","disc":"grappling"},{"id":"t3","d":0,"s":"19:00","e":"20:30","t":"JJB Gi","kind":"cours","disc":"jjb"}]'::jsonb where id = CA;
  select schedule::text into v_sched from public.clubs where id = CA;
  insert into public.profiles (user_id, club_id, role, display_name)
  select u, c, rl, 'DA test' from (values (I1, CA, 'coach'), (B1, CA, 'student'), (M2, CD, 'student')) t(u, c, rl)
  on conflict (user_id) do update set club_id = excluded.club_id, role = excluded.role;
  insert into public.academy_members (academy_id, user_id, role, display_name) values
    (CA, I1, 'instructor', 'DA prof'), (CA, B1, 'student', 'DA eleve'), (CA, M2, 'assistant', 'DA deux'), (CD, M2, 'student', 'DA deux');
  insert into public.uzu_platform_admins (user_id) values (P);
  v_res := v_res || pg_temp.da_l('0', 'mise en place fictive : 2 clubs, 7 personnes (dont un membre de deux clubs et l''équipe UZU)', CA is not null and CD is not null);

  -- Accès
  v_res := v_res || pg_temp.da_l('1', 'visiteur non connecté : ni recherche, ni fiche, ni lecture directe',
    pg_temp.da_anon_err('select public.dir_search(''91286'', 25)') is not null and pg_temp.da_anon_err('select public.dir_get(''x'')') is not null
    and pg_temp.da_anon_err('select count(*) from public.dir_clubs') is not null);
  v_res := v_res || pg_temp.da_l('2', 'aucune lecture directe des tables de l''annuaire, même connecté',
    pg_temp.da_err(X1, 'select count(*) from public.dir_clubs') is not null and pg_temp.da_err(A, 'select count(*) from public.dir_club_slots') is not null
    and pg_temp.da_err(P, 'select count(*) from public.dir_suggestions') is not null);

  -- Fiche du club client
  v_res := v_res || pg_temp.da_l('3', 'élève et indépendant : pas d''accès à la fiche du club ni à son enregistrement',
    pg_temp.da_err(B1, 'select public.dir_my_club()') is not null and pg_temp.da_err(X1, 'select public.dir_my_club()') is not null
    and pg_temp.da_err(B1, format('select public.dir_my_club_save(%L::jsonb)', ok_save)) is not null);
  e := pg_temp.da_err(I1, format('select public.dir_my_club_save(%L::jsonb)', ok_save));
  v_res := v_res || pg_temp.da_l('4', 'professeur sans le droit « Paramètres de l''académie » : enregistrement refusé', e is not null, 'accepté à tort');
  j := pg_temp.da_j(A, 'select public.dir_my_club()');
  v_res := v_res || pg_temp.da_l('5', 'responsable : fiche préremplie (nom du club) et ses 3 créneaux du planning, aucun publié',
    j->>'name' like 'DA test%' and jsonb_array_length(j->'slots') = 3 and not exists (select 1 from jsonb_array_elements(j->'slots') x where (x->>'pub')::boolean), j::text);
  v_res := v_res || pg_temp.da_l('6', 'contrôles : commune inconnue, sans discipline, créneau inexistant, type inconnu, courriel invalide → refusés',
    pg_temp.da_err(A, format('select public.dir_my_club_save(%L::jsonb)', jsonb_set(ok_save::jsonb, '{insee}', '"00000"'))) ilike '%commune%'
    and pg_temp.da_err(A, format('select public.dir_my_club_save(%L::jsonb)', jsonb_set(ok_save::jsonb, '{disciplines}', '[]'))) ilike '%discipline%'
    and pg_temp.da_err(A, format('select public.dir_my_club_save(%L::jsonb)', jsonb_set(ok_save::jsonb, '{slots}', '[{"id":"zz","kind":"open_mat"}]'))) ilike '%planning%'
    and pg_temp.da_err(A, format('select public.dir_my_club_save(%L::jsonb)', jsonb_set(ok_save::jsonb, '{slots}', '[{"id":"t1","kind":"fete"}]'))) is not null
    and pg_temp.da_err(A, format('select public.dir_my_club_save(%L::jsonb)', jsonb_set(ok_save::jsonb, '{email}', '"pas-un-courriel"'))) is not null);
  j := pg_temp.da_j(A, format('select public.dir_my_club_save(%L::jsonb)', ok_save));
  v_slug := j->>'slug';
  v_res := v_res || pg_temp.da_l('7', 'responsable : fiche publiée avec 2 créneaux ouverts, adresse d''URL propre',
    (j->>'ok')::boolean and (j->>'slots')::int = 2 and v_slug ~ '^da-club-test-grigny(-[a-z0-9]+)?$', j::text);
  v_res := v_res || pg_temp.da_l('8', 'le planning et la présentation du club ne sont pas modifiés',
    (select schedule::text from public.clubs where id = CA) = v_sched);

  -- Recherche (personnes connectées, avec ou sans club)
  j := pg_temp.da_j(X1, 'select public.dir_search(''94081'', 25)');
  v_res := v_res || pg_temp.da_l('9', 'indépendant à Vitry, 25 km : trouve le club, badge Club UZU, tranche « 10 à 25 km », 2 créneaux',
    exists (select 1 from jsonb_array_elements(j->'clubs') x where x->>'slug' = v_slug and (x->>'uzu')::boolean and x->>'band' = '10 à 25 km' and (x->>'n_sessions')::int = 2), j::text);
  v_res := v_res || pg_temp.da_l('10', 'résultat : aucune adresse ni donnée de membre, seulement les champs publics',
    not exists (select 1 from jsonb_array_elements(j->'clubs') x where x ? 'address' or x ? 'email' or x ? 'phone' or x ? 'club_id' or x::text ilike '%da-test-%@%'));
  j := pg_temp.da_j(X1, 'select public.dir_search(''75056'', 10)');
  v_res := v_res || pg_temp.da_l('11', 'hors rayon (Paris, 10 km) : pas trouvé', not exists (select 1 from jsonb_array_elements(j->'clubs') x where x->>'slug' = v_slug), j::text);
  v_res := v_res || pg_temp.da_l('12', 'filtres : open mat → 1 créneau ; samedi → trouvé ; lundi → absent (créneau non ouvert) ; No-Gi → trouvé',
    (select jsonb_array_length(x->'sessions') from jsonb_array_elements(pg_temp.da_j(B1, 'select public.dir_search(''91286'', 10, null, ''open_mat'')')->'clubs') x where x->>'slug' = v_slug) = 1
    and exists (select 1 from jsonb_array_elements(pg_temp.da_j(B1, 'select public.dir_search(''91286'', 10, null, null, 5)')->'clubs') x where x->>'slug' = v_slug)
    and not exists (select 1 from jsonb_array_elements(pg_temp.da_j(B1, 'select public.dir_search(''91286'', 10, null, null, 0)')->'clubs') x where x->>'slug' = v_slug)
    and exists (select 1 from jsonb_array_elements(pg_temp.da_j(D1, 'select public.dir_search(''91286'', 10, ''grappling_nogi'')')->'clubs') x where x->>'slug' = v_slug));
  j := pg_temp.da_j(M2, format('select public.dir_get(%L)', v_slug));
  v_res := v_res || pg_temp.da_l('13', 'membre de deux clubs (club actif = l''autre) : fiche complète, salle, conditions, créneaux',
    j->>'address' like 'Gymnase%' and j->'welcome'->>'price' = '10 €' and jsonb_array_length(j->'sessions') = 2 and j->'sessions'->0->>'kind' is not null, j::text);
  v_res := v_res || pg_temp.da_l('14', 'paramètres invalides refusés (commune, discipline, type, jour)',
    pg_temp.da_err(X1, 'select public.dir_search(''00000'', 25)') is not null and pg_temp.da_err(X1, 'select public.dir_search(''91286'', 25, ''mma'')') is not null
    and pg_temp.da_err(X1, 'select public.dir_search(''91286'', 25, null, ''fete'')') is not null and pg_temp.da_err(X1, 'select public.dir_search(''91286'', 25, null, null, 9)') is not null);

  -- Créneau retiré du planning : disparaît de l'annuaire
  update public.clubs set schedule = (select jsonb_agg(x) from jsonb_array_elements(schedule) x where x->>'id' <> 't2') where id = CA;
  v_res := v_res || pg_temp.da_l('15', 'créneau supprimé du planning par le club : il disparaît de l''annuaire',
    jsonb_array_length(pg_temp.da_j(X1, format('select public.dir_get(%L)', v_slug))->'sessions') = 1);
  update public.clubs set schedule = v_sched::jsonb where id = CA;

  -- Fiche masquée
  perform pg_temp.da_j(A, format('select public.dir_my_club_save(%L::jsonb)', jsonb_set(ok_save::jsonb, '{published}', 'false')));
  v_res := v_res || pg_temp.da_l('16', 'fiche masquée par le club : absente de la recherche, fiche refusée aux autres, visible du club',
    not exists (select 1 from jsonb_array_elements(pg_temp.da_j(X1, 'select public.dir_search(''91286'', 10)')->'clubs') x where x->>'slug' = v_slug)
    and pg_temp.da_err(X1, format('select public.dir_get(%L)', v_slug)) is not null and pg_temp.da_err(A, format('select public.dir_get(%L)', v_slug)) is null);

  -- Fiches référencées par l'équipe UZU
  e := pg_temp.da_err(A, 'select public.dir_admin_save(''{"name":"Club X","insee":"74010","disciplines":["grappling_nogi"],"status":"published"}''::jsonb)');
  v_res := v_res || pg_temp.da_l('17', 'création de fiche référencée : réservée à l''équipe UZU', e ilike '%équipe UZU%', coalesce(e, 'accepté à tort'));
  j := pg_temp.da_j(P, 'select public.dir_admin_save(''{"name":"DA Club Annecy","insee":"74010","address":"Salle fictive","disciplines":["jjb_gi","grappling_nogi"],"welcome":{"price":"15 €"},"status":"published","sessions":[{"d":5,"s":"10:00","e":"12:00","disc":"grappling","kind":"open_mat"},{"d":3,"s":"18:30","e":"20:00","disc":"jjb","kind":"trial"}]}''::jsonb)');
  v_staff := j->>'slug';
  j := pg_temp.da_j(X1, 'select public.dir_search(''74010'', 25, null, ''open_mat'')');
  v_res := v_res || pg_temp.da_l('18', 'équipe UZU : fiche référencée trouvée à Annecy, sans badge Club UZU, open mat seul',
    exists (select 1 from jsonb_array_elements(j->'clubs') x where x->>'slug' = v_staff and not (x->>'uzu')::boolean and jsonb_array_length(x->'sessions') = 1), j::text);
  v_res := v_res || pg_temp.da_l('19', 'l''équipe UZU ne peut pas modifier la fiche d''un club client',
    pg_temp.da_err(P, format('select public.dir_admin_save(%L::jsonb)', jsonb_build_object('slug', v_slug, 'name', 'X', 'insee', '91286'))) ilike '%club client%');

  -- Propositions
  v_res := v_res || pg_temp.da_l('20', 'proposition par un indépendant acceptée ; vide refusée ; sur fiche inconnue refusée',
    pg_temp.da_err(X1, 'select public.dir_suggest(null, ''{"name":"Club du coin","commune":"Évry","details":"Open mat le dimanche"}''::jsonb)') is null
    and pg_temp.da_err(X1, 'select public.dir_suggest(null, ''{}''::jsonb)') is not null
    and pg_temp.da_err(X1, 'select public.dir_suggest(''inconnu-xyz'', ''{"details":"x"}''::jsonb)') is not null);
  for n in 1..4 loop perform pg_temp.da_err(X1, 'select public.dir_suggest(null, ''{"details":"encore"}''::jsonb)'); end loop;
  v_res := v_res || pg_temp.da_l('21', 'limite : 6e proposition du jour refusée', pg_temp.da_err(X1, 'select public.dir_suggest(null, ''{"details":"trop"}''::jsonb)') ilike '%aujourd%');
  v_res := v_res || pg_temp.da_l('22', 'propositions lisibles par l''équipe UZU seulement',
    pg_temp.da_err(X1, 'select public.dir_admin_suggestions()') is not null and pg_temp.da_err(A, 'select public.dir_admin_suggestions()') is not null
    and jsonb_array_length(pg_temp.da_j(P, 'select public.dir_admin_suggestions()')) >= 5);

  raise exception using message = 'da_annulation';
  exception when others then
    if sqlerrm <> 'da_annulation' then v_res := v_res || pg_temp.da_l('!', 'ERREUR INATTENDUE : contrôle interrompu (tout a été annulé)', false, sqlerrm); end if;
  end;     -- ======== ici, tout ce qui précède est annulé ========

  select count(*) into n from auth.users where email like 'da-test-' || v_tag || '-%';
  v_res := v_res || pg_temp.da_l('Fin', 'annulation : aucune personne, club, fiche ni proposition de test ne reste',
    n = 0 and not exists (select 1 from public.dir_clubs where name like 'DA %'), n::text);
  v_res := v_res || pg_temp.da_l('Fin2', 'clubs, plannings, présentations, adhésions et profils existants identiques avant et après', pg_temp.da_snap() = v_before);
  return query
    select x->>'n', x->>'test', case when (x->>'ok')::boolean then '✔' else '✖' end, x->>'detail'
    from jsonb_array_elements(v_res) with ordinality t(x, i) order by i;
end $f$;

select * from pg_temp.da_controle();
