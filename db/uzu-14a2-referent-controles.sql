-- =====================================================================================
-- UZU — « Où rouler ? » rôle de référent UZU (uzu-14a2) : CONTRÔLES sur la base de TEST, sans compte réel
-- À coller en entier dans l'éditeur SQL de la base de TEST (ntypsrdwxrkanahhuixx), APRÈS uzu-14a et uzu-14a2.
--   1. vérifie qu'aucun référent n'est désigné ;
--   2. crée des personnes FICTIVES (responsable, élève, indépendant, administrateur plateforme,
--      référent, ancien référent) et vérifie ce que chacun peut faire ;
--   3. ANNULE TOUT à la fin et vérifie que l'existant est identique avant et après.
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
  v_mods_before int; v_log_before int;
  A uuid := gen_random_uuid(); B1 uuid := gen_random_uuid(); X1 uuid := gen_random_uuid();
  PA uuid := gen_random_uuid(); R uuid := gen_random_uuid(); RV uuid := gen_random_uuid();
  CA uuid; j jsonb; e text; v_cli text; v_staff text; n int;
  ok_save text := '{"name":"DA Club test","insee":"91286","address":"Gymnase des Tests, Grigny","disciplines":["jjb_gi"],"welcome":{"price":"10 €"},"published":true,"slots":[{"id":"t1","kind":"open_mat"}]}';
  staff text := '{"name":"DA Ref Evry","insee":"91228","address":"Salle fictive","disciplines":["jjb_gi","grappling_nogi"],"welcome":{"price":"Gratuit","inconnu":"x"},"status":"draft","sessions":[{"d":6,"s":"10:00","e":"12:00","disc":"grappling","kind":"open_mat"}]}';
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' then
    return query select '!'::text, 'Arrêt : cette base n''est pas reconnue comme la base de test. Rien n''a été fait.'::text, '✖'::text, ''::text; return;
  end if;
  if to_regclass('public.dir_moderators') is null then
    return query select '!'::text, 'Arrêt : uzu-14a2 doit être installé.'::text, '✖'::text, ''::text; return;
  end if;
  select count(*) into v_mods_before from public.dir_moderators;
  select count(*) into v_log_before from public.dir_moderation_log;
  v_res := v_res || pg_temp.da_l('1', 'aucun référent désigné sur la base (table des référents vide)', v_mods_before = 0, v_mods_before::text);

  begin   -- ======== tout ce bloc est annulé à la fin ========
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 'da-test-' || v_tag || '-' || s || '@uzu.invalid', jsonb_build_object('name', 'DA test ' || s)
  from (values (A, 'resp'), (B1, 'eleve'), (X1, 'solo'), (PA, 'adminplateforme'), (R, 'referent'), (RV, 'ancienreferent')) t(u, s);
  perform pg_temp.da_j(A, format('select public.create_new_club(%L, %L)', 'DA test ' || v_tag, upper('DAT-' || v_tag)));
  select academy_id into CA from public.academy_members where user_id = A;
  update public.clubs set schedule = '[{"id":"t1","d":5,"s":"11:00","e":"13:00","t":"Open mat","kind":"open","disc":"grappling"}]'::jsonb where id = CA;
  insert into public.profiles (user_id, club_id, role, display_name) values (B1, CA, 'student', 'DA eleve'), (R, null, 'solo', 'DA Référent')
  on conflict (user_id) do update set club_id = excluded.club_id, role = excluded.role, display_name = excluded.display_name;
  insert into public.academy_members (academy_id, user_id, role, display_name) values (CA, B1, 'student', 'DA eleve');
  insert into public.uzu_platform_admins (user_id) values (PA);
  insert into public.dir_moderators (user_id, granted_note) values (R, 'contrôle fictif');
  insert into public.dir_moderators (user_id, active, revoked_at, granted_note) values (RV, false, now(), 'contrôle fictif, retiré');
  j := pg_temp.da_j(A, format('select public.dir_my_club_save(%L::jsonb)', ok_save)); v_cli := j->>'slug';
  v_res := v_res || pg_temp.da_l('0', 'mise en place fictive : 1 club publié, 6 personnes (dont admin plateforme, référent, ancien référent)', v_cli is not null, j::text);

  v_res := v_res || pg_temp.da_l('2', 'tables des référents et du journal fermées (connecté ou non)',
    pg_temp.da_err(R, 'select count(*) from public.dir_moderators') is not null and pg_temp.da_err(R, 'select count(*) from public.dir_moderation_log') is not null
    and pg_temp.da_anon_err('select count(*) from public.dir_moderators') is not null);
  v_res := v_res || pg_temp.da_l('3', 'statut affiché : référent oui ; responsable, indépendant, admin plateforme, ancien référent non',
    (pg_temp.da_j(R, 'select public.dir_whoami()')->>'moderator')::boolean and not (pg_temp.da_j(A, 'select public.dir_whoami()')->>'moderator')::boolean
    and not (pg_temp.da_j(X1, 'select public.dir_whoami()')->>'moderator')::boolean and not (pg_temp.da_j(PA, 'select public.dir_whoami()')->>'moderator')::boolean
    and not (pg_temp.da_j(RV, 'select public.dir_whoami()')->>'moderator')::boolean);
  v_res := v_res || pg_temp.da_l('4', 'administrateur plateforme sans rôle de référent : aucun outil de modération',
    pg_temp.da_err(PA, 'select public.dir_admin_list()') ilike '%référent%' and pg_temp.da_err(PA, format('select public.dir_admin_save(%L::jsonb)', staff)) is not null
    and pg_temp.da_err(PA, 'select public.dir_admin_suggestions(null)') is not null and pg_temp.da_err(PA, 'select public.dir_admin_log(10)') is not null);
  v_res := v_res || pg_temp.da_l('5', 'responsable, élève, indépendant, ancien référent : aucun outil de modération',
    pg_temp.da_err(A, 'select public.dir_admin_list()') is not null and pg_temp.da_err(B1, 'select public.dir_admin_list()') is not null
    and pg_temp.da_err(X1, format('select public.dir_admin_set_status(%L, ''moderated'', ''abus'')', v_cli)) is not null
    and pg_temp.da_err(RV, 'select public.dir_admin_list()') is not null);
  v_res := v_res || pg_temp.da_l('6', 'visiteur non connecté : aucun outil, aucun statut',
    pg_temp.da_anon_err('select public.dir_whoami()') is not null and pg_temp.da_anon_err('select public.dir_admin_list()') is not null);

  -- Fiches référencées
  j := pg_temp.da_j(R, format('select public.dir_admin_save(%L::jsonb)', staff)); v_staff := j->>'slug';
  v_res := v_res || pg_temp.da_l('7', 'référent : fiche référencée créée en brouillon, conditions d''accueil nettoyées',
    v_staff ~ '^da-ref-evry-evry-courcouronnes' and (select status = 'draft' and not (welcome ? 'inconnu') and origin = 'uzu_staff' from public.dir_clubs where slug = v_staff), j::text);
  v_res := v_res || pg_temp.da_l('8', 'brouillon : visible dans la liste du référent (91), absent de la recherche publique',
    exists (select 1 from jsonb_array_elements(pg_temp.da_j(R, 'select public.dir_admin_list(''91'')')) x where x->>'slug' = v_staff and x->>'status' = 'draft')
    and not exists (select 1 from jsonb_array_elements(pg_temp.da_j(X1, 'select public.dir_search(''91228'', 10)')->'clubs') x where x->>'slug' = v_staff));
  perform pg_temp.da_j(R, format('select public.dir_admin_set_status(%L, ''published'')', v_staff));
  v_res := v_res || pg_temp.da_l('9', 'publication par le référent : trouvée par la recherche, sans badge Club UZU',
    exists (select 1 from jsonb_array_elements(pg_temp.da_j(X1, 'select public.dir_search(''91228'', 10)')->'clubs') x where x->>'slug' = v_staff and not (x->>'uzu')::boolean));
  v_res := v_res || pg_temp.da_l('10', 'créneau mal saisi (heure, jour, type) : refusé',
    pg_temp.da_err(R, format('select public.dir_admin_save(%L::jsonb)', jsonb_set(jsonb_set(staff::jsonb, '{slug}', to_jsonb(v_staff)), '{sessions}', '[{"d":6,"s":"25:00","e":"12:00","kind":"open_mat"}]'))) ilike '%heure%'
    and pg_temp.da_err(R, format('select public.dir_admin_save(%L::jsonb)', jsonb_set(jsonb_set(staff::jsonb, '{slug}', to_jsonb(v_staff)), '{sessions}', '[{"d":9,"s":"10:00","e":"12:00","kind":"open_mat"}]'))) ilike '%jour%'
    and pg_temp.da_err(R, format('select public.dir_admin_save(%L::jsonb)', jsonb_set(jsonb_set(staff::jsonb, '{slug}', to_jsonb(v_staff)), '{sessions}', '[{"d":1,"s":"10:00","e":"12:00","kind":"fete"}]'))) ilike '%type%');

  -- Fiche d'un club client
  v_res := v_res || pg_temp.da_l('11', 'référent : ne peut ni modifier ni publier la fiche d''un club client ; masquage sans motif refusé',
    pg_temp.da_err(R, format('select public.dir_admin_save(%L::jsonb)', jsonb_build_object('slug', v_cli, 'name', 'Autre nom', 'insee', '91286'))) ilike '%club client%'
    and pg_temp.da_err(R, format('select public.dir_admin_set_status(%L, ''published'')', v_cli)) is not null
    and pg_temp.da_err(R, format('select public.dir_admin_set_status(%L, ''moderated'', '''')', v_cli)) ilike '%motif%');
  perform pg_temp.da_j(R, format('select public.dir_admin_set_status(%L, ''moderated'', ''Horaires trompeurs signalés'')', v_cli));
  v_res := v_res || pg_temp.da_l('12', 'masquage de modération : absente de la recherche, le club le voit',
    not exists (select 1 from jsonb_array_elements(pg_temp.da_j(X1, 'select public.dir_search(''91286'', 10)')->'clubs') x where x->>'slug' = v_cli)
    and (pg_temp.da_j(A, 'select public.dir_my_club()')->>'moderated')::boolean);
  j := pg_temp.da_j(A, format('select public.dir_my_club_save(%L::jsonb)', ok_save));
  v_res := v_res || pg_temp.da_l('13', 'le club ne peut pas republier tant que le masquage n''est pas levé',
    (j->>'moderated')::boolean and (select status from public.dir_clubs where slug = v_cli) = 'hidden', j::text);
  perform pg_temp.da_j(R, format('select public.dir_admin_set_status(%L, ''unmoderated'')', v_cli));
  n := (select case when status = 'hidden' then 1 else 0 end from public.dir_clubs where slug = v_cli);
  perform pg_temp.da_j(A, format('select public.dir_my_club_save(%L::jsonb)', ok_save));
  v_res := v_res || pg_temp.da_l('14', 'masquage levé : la fiche reste masquée jusqu''à ce que le club republie, puis réapparaît',
    n = 1 and (select status from public.dir_clubs where slug = v_cli) = 'published');
  v_res := v_res || pg_temp.da_l('15', 'détails de modération visibles du seul référent',
    pg_temp.da_j(R, format('select public.dir_get(%L)', v_cli)) ? 'moderated' and not (pg_temp.da_j(X1, format('select public.dir_get(%L)', v_cli)) ? 'moderated')
    and not (pg_temp.da_j(X1, format('select public.dir_get(%L)', v_cli)) ? 'origin'));

  -- Propositions et journal
  perform pg_temp.da_j(X1, 'select to_jsonb(public.dir_suggest(null, ''{"name":"Club du coin","commune":"Évry"}''::jsonb))');
  j := pg_temp.da_j(R, 'select public.dir_admin_suggestions(''open'')');
  perform pg_temp.da_j(R, format('select to_jsonb(public.dir_admin_resolve(%L::uuid, ''accepted''))', (select x->>'id' from jsonb_array_elements(j) x where x->'payload'->>'name' = 'Club du coin')));
  v_res := v_res || pg_temp.da_l('16', 'proposition traitée : sort de la liste « à traiter »',
    exists (select 1 from jsonb_array_elements(j) x where x->'payload'->>'name' = 'Club du coin')
    and not exists (select 1 from jsonb_array_elements(pg_temp.da_j(R, 'select public.dir_admin_suggestions(''open'')')) x where x->'payload'->>'name' = 'Club du coin'));
  j := pg_temp.da_j(R, 'select public.dir_admin_log(50)');
  v_res := v_res || pg_temp.da_l('17', 'journal : création, publication, masquage, levée, proposition tracés, nom affiché sans adresse électronique',
    (select count(*) from jsonb_array_elements(j) x where x->>'action' in ('club.created','club.status','suggestion.accepted')) >= 5
    and j::text like '%DA Référent%' and j::text not like '%@%', left(j::text, 200));

  raise exception using message = 'da_annulation';
  exception when others then
    if sqlerrm <> 'da_annulation' then v_res := v_res || pg_temp.da_l('!', 'ERREUR INATTENDUE : contrôle interrompu (tout a été annulé)', false, sqlerrm); end if;
  end;     -- ======== ici, tout ce qui précède est annulé ========

  select count(*) into n from auth.users where email like 'da-test-' || v_tag || '-%';
  v_res := v_res || pg_temp.da_l('Fin', 'annulation : aucune personne, fiche, référent ni ligne de journal de test ne reste',
    n = 0 and (select count(*) from public.dir_moderators) = v_mods_before and (select count(*) from public.dir_moderation_log) = v_log_before
    and not exists (select 1 from public.dir_clubs where name like 'DA %'), n::text);
  v_res := v_res || pg_temp.da_l('Fin2', 'clubs, plannings, présentations, adhésions et profils existants identiques avant et après', pg_temp.da_snap() = v_before);
  return query
    select x->>'n', x->>'test', case when (x->>'ok')::boolean then '✔' else '✖' end, x->>'detail'
    from jsonb_array_elements(v_res) with ordinality t(x, i) order by i;
end $f$;

select * from pg_temp.da_controle();
