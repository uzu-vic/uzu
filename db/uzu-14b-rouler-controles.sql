-- =====================================================================================
-- UZU — « Où rouler ? » étape 2, créneaux et partenaires de roulage (uzu-14b révisé) : CONTRÔLES sur la base de TEST, sans compte réel
-- À coller en entier dans l'éditeur SQL de la base de TEST (ntypsrdwxrkanahhuixx), APRÈS uzu-14b.
--   1. crée des personnes FICTIVES : deux clubs, adhérents, professeur, multi-club, indépendant, mineur,
--      profil masqué, référent, personnes qui signalent ;
--   2. vérifie activation, créneaux (raccourcis, durée, heure locale), recherche (qui voit qui, temps en commun, Maintenant,
--      Mon créneau, déplacement), blocage, signalement, référent, expiration ;
--   3. ANNULE TOUT à la fin et vérifie que l'existant est identique avant et après.
-- Refuse de tourner hors de la base de test.
-- =====================================================================================

create or replace function pg_temp.rb_as(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then
    perform set_config('role', 'none', true); perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;
create or replace function pg_temp.rb_anon() returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '{"role":"anon"}', true); perform set_config('role', 'anon', true); end $$;
create or replace function pg_temp.rb_j(p_uid uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb; begin perform pg_temp.rb_as(p_uid); execute p_sql into v; perform pg_temp.rb_as(null); return v; end $$;
create or replace function pg_temp.rb_err(p_uid uuid, p_sql text) returns text language plpgsql as $$
begin perform pg_temp.rb_as(p_uid); execute p_sql; perform pg_temp.rb_as(null); return null;
exception when others then perform pg_temp.rb_as(null); return coalesce(nullif(sqlerrm, ''), 'refusé'); end $$;
create or replace function pg_temp.rb_anon_err(p_sql text) returns text language plpgsql as $$
begin perform pg_temp.rb_anon(); execute p_sql; perform pg_temp.rb_as(null); return null;
exception when others then perform pg_temp.rb_as(null); return coalesce(nullif(sqlerrm, ''), 'refusé'); end $$;
create or replace function pg_temp.rb_l(p_n text, p_test text, p_ok boolean, p_detail text default '') returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('n', p_n, 'test', p_test, 'ok', coalesce(p_ok, false), 'detail', case when coalesce(p_ok, false) then '' else left(coalesce(p_detail, ''), 200) end))
$$;
create or replace function pg_temp.rb_snap() returns text language sql as $$
  select md5(coalesce((select string_agg(id::text || name || coalesce(schedule::text, '') || coalesce(profile::text, ''), '|' order by id) from public.clubs), '')
          || coalesce((select string_agg(academy_id::text || user_id::text || role || status || coalesce(section_id::text, ''), '|' order by academy_id, user_id) from public.academy_members), '')
          || coalesce((select string_agg(user_id::text || coalesce(club_id::text, '') || role || coalesce(display_name, ''), '|' order by user_id) from public.profiles), '')
          || coalesce((select string_agg(blocker_id::text || blocked_id::text, '|' order by blocker_id, blocked_id) from public.user_blocks), '')
          || coalesce((select string_agg(path || md5(data::text), '|' order by path) from public.docs), '')
          || coalesce((select string_agg(slug || status, '|' order by slug) from public.dir_clubs), '')
          || (select count(*)::text from public.dir_moderators) || (select count(*)::text from public.dir_moderation_log)
          || (select count(*)::text from public.rouler_profiles) || (select count(*)::text from public.rouler_availabilities)
          || (select count(*)::text from public.rouler_reports))
$$;
-- Recherche : renvoie les noms trouvés, triés
create or replace function pg_temp.rb_names(p_uid uuid, p_sql text) returns text language plpgsql as $$
declare j jsonb := pg_temp.rb_j(p_uid, p_sql);
begin
  if j ? 'need' then return 'need:' || (j->>'need'); end if;
  return coalesce((select string_agg(distinct x->>'name', ',' order by x->>'name') from jsonb_array_elements(j->'results') x), '');
end $$;

create or replace function pg_temp.rb_controle() returns table (num text, test text, resultat text, detail text)
language plpgsql as $f$
declare
  v_res jsonb := '[]'; v_url text; v_tag text := left(replace(gen_random_uuid()::text, '-', ''), 8); v_before text := pg_temp.rb_snap();
  v_log_before int;
  OA uuid := gen_random_uuid(); OB uuid := gen_random_uuid();
  P1 uuid := gen_random_uuid(); P2 uuid := gen_random_uuid(); PR uuid := gen_random_uuid(); P3 uuid := gen_random_uuid();
  P4 uuid := gen_random_uuid(); P5 uuid := gen_random_uuid(); MI uuid := gen_random_uuid(); H uuid := gen_random_uuid();
  R uuid := gen_random_uuid(); N0 uuid := gen_random_uuid(); S1 uuid := gen_random_uuid(); S2 uuid := gen_random_uuid(); S3 uuid := gen_random_uuid();
  K uuid := gen_random_uuid(); L uuid := gen_random_uuid(); SM uuid := gen_random_uuid(); INS uuid := gen_random_uuid(); JO uuid := gen_random_uuid();
  KB uuid := gen_random_uuid(); LB uuid := gen_random_uuid();
  CA uuid; CB uuid; SEC uuid; j jsonb; e text; n int; t text; h2 uuid; h3 uuid; hpr uuid; h4 uuid; h5 uuid; hk uuid; hp1 uuid; hp1b uuid; hkb uuid;
  now_m timestamptz := date_trunc('minute', now()); rd text := to_char((now() + interval '2 days') at time zone 'Indian/Reunion', 'YYYY-MM-DD');
  act text := '{"adult":true,"consent":true,"safety":true,"home_insee":"91286","disciplines":["jjb_gi"],"intensities":["technique","modere"]}';
  av text := '{"when":"now","minutes":120,"disciplines":["jjb_gi"],"intensities":["technique","modere"],"places":["club","open_mat"],"note":"Dispo pour rouler"}';
  q10 text := 'select public.rouler_search(''{"insee":"91286","radius":10}''::jsonb)';
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' then
    return query select '!'::text, 'Arrêt : cette base n''est pas reconnue comme la base de test. Rien n''a été fait.'::text, '✖'::text, ''::text; return;
  end if;
  if to_regclass('public.rouler_profiles') is null then
    return query select '!'::text, 'Arrêt : uzu-14b doit être installé.'::text, '✖'::text, ''::text; return;
  end if;
  select count(*) into v_log_before from public.dir_moderation_log;

  begin   -- ======== tout ce bloc est annulé à la fin ========
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 'rb-test-' || v_tag || '-' || s || '@uzu.invalid', jsonb_build_object('name', nm)
  from (values (OA, 'respa', 'Resp A'), (OB, 'respb', 'Resp B'), (P1, 'p1', 'Karim Adherent'), (P2, 'p2', 'Sarah Bleue'),
               (PR, 'prof', 'Paul Professeur'), (P3, 'p3', 'Nadia Autreclub'), (P4, 'p4', 'Omar Independant'), (P5, 'p5', 'Lina Multiclub'),
               (MI, 'mineur', 'Theo Mineur'), (H, 'masque', 'Hugo Masque'), (R, 'referent', 'Ref Test'), (N0, 'aucun', 'Sans Profil'),
               (S1, 's1', 'Sig Un'), (S2, 's2', 'Sig Deux'), (S3, 's3', 'Sig Trois'),
               (K, 'kevin', 'Kevin Temps'), (L, 'lou', 'Lou Temps'), (SM, 'sam', 'Sam Temps'), (INS, 'ines', 'Ines Temps'), (JO, 'jo', 'Jo Temps'),
               (KB, 'karim', 'Karim Lyon'), (LB, 'lea', 'Lea Bordeaux')) t(u, s, nm);
  perform pg_temp.rb_j(OA, format('select to_jsonb(public.create_new_club(%L, %L))', 'RB club A ' || v_tag, upper('RBA-' || v_tag)));
  perform pg_temp.rb_j(OB, format('select to_jsonb(public.create_new_club(%L, %L))', 'RB club B ' || v_tag, upper('RBB-' || v_tag)));
  select academy_id into CA from public.academy_members where user_id = OA;
  select academy_id into CB from public.academy_members where user_id = OB;
  insert into public.academy_sections (academy_id, name, minors) values (CA, 'RB enfants', true) returning id into SEC;
  insert into public.academy_members (academy_id, user_id, role, display_name, section_id) values
    (CA, P1, 'student', 'Karim A.', null), (CA, P2, 'student', 'Sarah B.', null), (CA, PR, 'instructor', 'Paul P.', null),
    (CB, P3, 'student', 'Nadia A.', null), (CA, P5, 'student', 'Lina M.', null), (CB, P5, 'assistant', 'Lina M.', null),
    (CA, MI, 'student', 'Theo M.', SEC), (CA, H, 'student', 'Hugo M.', null), (CA, S1, 'student', 'Sig U.', null),
    (CA, S2, 'student', 'Sig D.', null), (CB, S3, 'student', 'Sig T.', null);
  insert into public.profiles (user_id, club_id, role, display_name) values
    (P1, CA, 'student', 'Karim Adherent'), (P2, CA, 'student', 'Sarah Bleue'), (PR, CA, 'coach', 'Paul Professeur'),
    (P3, CB, 'student', 'Nadia Autreclub'), (P4, null, 'solo', 'Omar Independant'), (P5, CA, 'student', 'Lina Multiclub'),
    (MI, CA, 'student', 'Theo Mineur'), (H, CA, 'student', 'Hugo Masque'), (R, null, 'solo', 'Ref Test')
  on conflict (user_id) do update set club_id = excluded.club_id, role = excluded.role, display_name = excluded.display_name;
  insert into public.docs (path, data) values ('grades/' || P2, '{"rank":"bleue","stripes":1}'), ('grades/' || P3, '{"rank":"violette","stripes":0}'),
    ('grades/' || PR, '{"rank":"noire","stripes":2}')
  on conflict (path) do update set data = excluded.data;
  insert into public.dir_moderators (user_id, granted_note) values (R, 'contrôle fictif');
  v_res := v_res || pg_temp.rb_l('0', 'mise en place fictive : 2 clubs, 22 personnes (adhérents, professeur, multi-club, indépendant, mineur, référent, cas horaires, Karim et Léa)',
    CA is not null and CB is not null and SEC is not null);

  -- ---------- Fermeture ----------
  v_res := v_res || pg_temp.rb_l('1', 'les 4 tables sont fermées au navigateur (connecté ou non)',
    pg_temp.rb_err(P1, 'select count(*) from public.rouler_profiles') is not null and pg_temp.rb_err(P1, 'select count(*) from public.rouler_availabilities') is not null
    and pg_temp.rb_err(P1, 'select count(*) from public.rouler_reports') is not null and pg_temp.rb_err(P1, 'select count(*) from public.rouler_search_log') is not null
    and pg_temp.rb_anon_err('select count(*) from public.rouler_availabilities') is not null);
  v_res := v_res || pg_temp.rb_l('2', 'visiteur non connecté : aucune fonction (profil, recherche, signalement)',
    pg_temp.rb_anon_err('select public.rouler_me()') is not null and pg_temp.rb_anon_err(q10) is not null
    and pg_temp.rb_anon_err(format('select public.rouler_report(%L::uuid, ''faux'')', gen_random_uuid())) is not null);
  v_res := v_res || pg_temp.rb_l('3', 'outils internes (nom, ceinture, mineur, club commun, blocage, expiration) non appelables',
    pg_temp.rb_err(P1, format('select public.rouler_name(%L::uuid)', P2)) is not null and pg_temp.rb_err(P1, format('select public.rouler_belt(%L::uuid)', P2)) is not null
    and pg_temp.rb_err(P1, format('select public.rouler_is_minor(%L::uuid)', MI)) is not null and pg_temp.rb_err(P1, format('select public.rouler_share_club(%L::uuid, %L::uuid)', P1, P2)) is not null
    and pg_temp.rb_err(P1, format('select public.rouler_blocked(%L::uuid, %L::uuid)', P1, P2)) is not null and pg_temp.rb_err(P1, 'select public.rouler_expire()') is not null);

  -- ---------- Activation ----------
  j := pg_temp.rb_j(N0, 'select public.rouler_me()');
  v_res := v_res || pg_temp.rb_l('4', 'sans activation : aucun profil, rien n''est créé en consultant',
    j->'profile' = 'null'::jsonb and not exists (select 1 from public.rouler_profiles where user_id = N0), j::text);
  v_res := v_res || pg_temp.rb_l('5', 'activation refusée sans majorité, sans accord ou sans conseils de sécurité',
    pg_temp.rb_err(P1, format('select public.rouler_activate(%L::jsonb)', (act::jsonb - 'adult')::text)) ilike '%18 ans%'
    and pg_temp.rb_err(P1, format('select public.rouler_activate(%L::jsonb)', (act::jsonb || '{"consent":false}')::text)) ilike '%accord%'
    and pg_temp.rb_err(P1, format('select public.rouler_activate(%L::jsonb)', (act::jsonb - 'safety')::text)) ilike '%sécurité%');
  e := pg_temp.rb_err(MI, format('select public.rouler_activate(%L::jsonb)', act));
  v_res := v_res || pg_temp.rb_l('6', 'membre d''un groupe de mineurs : activation refusée même en cochant la majorité', e ilike '%mineurs%', e);
  j := pg_temp.rb_j(P1, format('select public.rouler_activate(%L::jsonb)', act));
  v_res := v_res || pg_temp.rb_l('7', 'activation : invisible par défaut, ceinture, club et années non montrés',
    j->'profile'->>'visibility' = 'hidden' and not (j->'profile'->>'show_belt')::boolean and j->'profile'->'show_club_id' = 'null'::jsonb
    and j->'profile'->'years' = 'null'::jsonb and j->>'name' = 'Karim A.', j::text);
  v_res := v_res || pg_temp.rb_l('8', 'champs invalides refusés : club dont on n''est pas membre, discipline fermée (MMA), type inconnu, années hors bornes',
    pg_temp.rb_err(P1, format('select public.rouler_save_profile(%L::jsonb)', (act::jsonb || jsonb_build_object('show_club_id', CB))::text)) ilike '%club%'
    and pg_temp.rb_err(P1, format('select public.rouler_save_profile(%L::jsonb)', (act::jsonb || '{"disciplines":["mma"]}')::text)) ilike '%discipline%'
    and pg_temp.rb_err(P1, format('select public.rouler_save_profile(%L::jsonb)', (act::jsonb || '{"intensities":["violent"]}')::text)) ilike '%type%'
    and pg_temp.rb_err(P1, format('select public.rouler_save_profile(%L::jsonb)', (act::jsonb || '{"years":99}')::text)) ilike '%années%');

  -- Profils de la distribution
  perform pg_temp.rb_j(P2, format('select public.rouler_activate(%L::jsonb)', (act::jsonb || '{"visibility":"clubs","show_belt":true}')::text));
  perform pg_temp.rb_j(PR, format('select public.rouler_activate(%L::jsonb)', (act::jsonb || jsonb_build_object('visibility', 'clubs', 'show_belt', true, 'show_club_id', CA, 'years', 15))::text));
  perform pg_temp.rb_j(P3, format('select public.rouler_activate(%L::jsonb)', (act::jsonb || '{"visibility":"uzu","show_belt":true,"home_insee":"91228"}')::text));
  perform pg_temp.rb_j(P4, format('select public.rouler_activate(%L::jsonb)', (act::jsonb || '{"visibility":"uzu","home_insee":"91228","disciplines":["grappling_nogi"],"intensities":["intense"]}')::text));
  perform pg_temp.rb_j(P5, format('select public.rouler_activate(%L::jsonb)', (act::jsonb || '{"visibility":"clubs"}')::text));
  perform pg_temp.rb_j(H, format('select public.rouler_activate(%L::jsonb)', act));
  perform pg_temp.rb_j(S1, format('select public.rouler_activate(%L::jsonb)', act));

  -- ---------- Créneaux ----------
  v_res := v_res || pg_temp.rb_l('9', 'créneau refusé : durée hors 1 h / 1 h 30 / 2 h / 3 h, moment inconnu, début passé, au-delà de 30 jours, pas au quart d''heure, heure inexistante',
    pg_temp.rb_err(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || '{"minutes":45}')::text)) ilike '%durée%'
    and pg_temp.rb_err(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || '{"when":"demain"}')::text)) ilike '%moment%'
    and pg_temp.rb_err(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || jsonb_build_object('when', 'custom', 'date', to_char((now() - interval '1 day') at time zone 'Europe/Paris', 'YYYY-MM-DD'), 'time', '10:00'))::text)) ilike '%passé%'
    and pg_temp.rb_err(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || jsonb_build_object('when', 'custom', 'date', to_char((now() + interval '40 days') at time zone 'Europe/Paris', 'YYYY-MM-DD'), 'time', '10:00'))::text)) ilike '%30%'
    and pg_temp.rb_err(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || jsonb_build_object('when', 'custom', 'date', to_char((now() + interval '2 days') at time zone 'Europe/Paris', 'YYYY-MM-DD'), 'time', '10:07'))::text)) ilike '%quart%'
    and pg_temp.rb_err(P1, 'select 1') is null);
  v_res := v_res || pg_temp.rb_l('10', 'contenu refusé : aucun lieu, mot de plus de 140 caractères, discipline fermée',
    pg_temp.rb_err(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || '{"places":[]}')::text)) ilike '%lieu%'
    and pg_temp.rb_err(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || jsonb_build_object('note', repeat('x', 141)))::text)) ilike '%140%'
    and pg_temp.rb_err(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || '{"disciplines":["mma"]}')::text)) ilike '%discipline%');
  j := pg_temp.rb_j(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || '{"insee":"75056"}')::text));
  select id into hp1 from public.rouler_availabilities where user_id = P1;
  v_res := v_res || pg_temp.rb_l('11', '« Maintenant », 2 h, dans ma ville : début à l''heure du serveur (à la minute), fin 2 h après, ville habituelle et heure de Paris',
    (select starts_at = now_m and ends_at = now_m + interval '2 hours' and insee = '91286' and tz = 'Europe/Paris' and not is_travel from public.rouler_availabilities where id = hp1)
    and jsonb_array_length(j->'availabilities') = 1 and j->'availabilities'->0->>'state' = 'current', j::text);
  e := pg_temp.rb_err(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || '{"when":"30","minutes":60}')::text));
  perform pg_temp.rb_j(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || '{"when":"240","minutes":60}')::text));
  select id into hp1b from public.rouler_availabilities where user_id = P1 and id <> hp1;
  v_res := v_res || pg_temp.rb_l('12', '« Dans 30 min » sur un créneau déjà pris : refusé ; « Dans 4 h », 1 h : de l''heure du serveur + 4 h à + 5 h',
    e ilike '%déjà un créneau%' and (select starts_at = now_m + interval '4 hours' and ends_at = now_m + interval '5 hours' from public.rouler_availabilities where id = hp1b), e);
  j := pg_temp.rb_j(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || jsonb_build_object('when', 'custom', 'is_travel', true, 'insee', '97411', 'date', rd, 'time', '10:00'))::text));
  v_res := v_res || pg_temp.rb_l('13', 'autre moment ailleurs (Saint-Denis de La Réunion, 10:00 heure locale) : enregistré à l''heure universelle juste, fuseau du lieu, ville habituelle inchangée',
    (select starts_at = ((rd || ' 10:00')::timestamp at time zone 'Indian/Reunion') and tz = 'Indian/Reunion' and is_travel
       from public.rouler_availabilities where user_id = P1 and insee = '97411')
    and to_char((select starts_at from public.rouler_availabilities where user_id = P1 and insee = '97411') at time zone 'UTC', 'HH24:MI') = '06:00'
    and (select home_insee from public.rouler_profiles where user_id = P1) = '91286', j::text);
  e := pg_temp.rb_err(P1, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || '{"when":"120","minutes":60}')::text));
  j := pg_temp.rb_j(P1, format('select public.rouler_save_profile(%L::jsonb)', (act::jsonb || '{"home_insee":"91174"}')::text));
  v_res := v_res || pg_temp.rb_l('13b', '4e créneau refusé (3 au plus) ; changement de ville habituelle : seuls les créneaux « dans ma ville » suivent',
    e ilike '%3 créneaux%' and (select count(*) from public.rouler_availabilities where user_id = P1 and not is_travel and insee = '91174') = 2
    and (select count(*) from public.rouler_availabilities where user_id = P1 and is_travel and insee = '97411') = 1, e);
  perform pg_temp.rb_j(P1, format('select public.rouler_save_profile(%L::jsonb)', (act::jsonb || '{"visibility":"clubs"}')::text));

  perform pg_temp.rb_j(P2, format('select public.rouler_save_availability(%L::jsonb)', av));
  perform pg_temp.rb_j(PR, format('select public.rouler_save_availability(%L::jsonb)', av));
  perform pg_temp.rb_j(P3, format('select public.rouler_save_availability(%L::jsonb)', av));
  perform pg_temp.rb_j(P4, format('select public.rouler_save_availability(%L::jsonb)', (av::jsonb || '{"disciplines":["grappling_nogi"],"intensities":["intense"]}')::text));
  perform pg_temp.rb_j(P5, format('select public.rouler_save_availability(%L::jsonb)', av));
  perform pg_temp.rb_j(H, format('select public.rouler_save_availability(%L::jsonb)', av));
  select id into h2 from public.rouler_availabilities where user_id = P2;
  select id into h3 from public.rouler_availabilities where user_id = P3;
  select id into hpr from public.rouler_availabilities where user_id = PR;
  select id into h4 from public.rouler_availabilities where user_id = P4;
  select id into h5 from public.rouler_availabilities where user_id = P5;

  -- ---------- Recherche : qui voit qui ----------
  v_res := v_res || pg_temp.rb_l('14', 'recherche sans profil activé, ou avec un profil invisible : rien, on invite à activer ou à devenir visible',
    pg_temp.rb_names(N0, q10) = 'need:activate' and pg_temp.rb_names(H, q10) = 'need:visible');
  t := pg_temp.rb_names(P1, q10);
  v_res := v_res || pg_temp.rb_l('15', 'adhérent (mes clubs) : voit son club (adhérente, professeur, multi-club), pas l''autre club ni l''indépendant ni le profil masqué',
    t = 'Lina M.,Paul P.,Sarah B.', t);
  t := pg_temp.rb_names(P4, q10);
  v_res := v_res || pg_temp.rb_l('16', 'indépendant (tout UZU) : voit seulement les profils « tout UZU » (autre club), pas ceux limités aux clubs',
    t = 'Nadia A.', t);
  t := pg_temp.rb_names(P3, q10);
  v_res := v_res || pg_temp.rb_l('17', 'réciprocité « tout UZU » et club commun : l''adhérente de l''autre club voit l''indépendant et le multi-club, pas le club A',
    t = 'Lina M.,Omar I.', t);
  t := pg_temp.rb_names(P5, q10);
  v_res := v_res || pg_temp.rb_l('18', 'multi-club : voit les pratiquants visibles de ses deux clubs', t = 'Karim A.,Nadia A.,Paul P.,Sarah B.', t);
  t := pg_temp.rb_names(PR, q10);
  v_res := v_res || pg_temp.rb_l('19', 'professeur : mêmes règles qu''un adhérent (son club, rien de plus)', t = 'Karim A.,Lina M.,Sarah B.', t);
  -- Un mineur placé dans un groupe de mineurs après coup : jamais visible, ne peut plus publier
  insert into public.rouler_profiles (user_id, visibility, home_insee, disciplines, intensities, adult_declared_at, consent_at, safety_ack_at)
  values (MI, 'clubs', '91286', '{jjb_gi}', '{technique}', now(), now(), now());
  insert into public.rouler_availabilities (user_id, insee, tz, starts_at, ends_at, disciplines, intensities, places)
  values (MI, '91286', 'Europe/Paris', now() - interval '10 minutes', now() + interval '2 hours', '{jjb_gi}', '{technique}', '{club}');
  v_res := v_res || pg_temp.rb_l('20', 'mineur : jamais dans les résultats, recherche et publication refusées',
    pg_temp.rb_names(P2, q10) not like '%Theo%' and pg_temp.rb_names(MI, q10) = 'need:adult'
    and pg_temp.rb_err(MI, format('select public.rouler_save_availability(%L::jsonb)', av)) ilike '%mineurs%');
  j := pg_temp.rb_j(P1, q10);
  t := j->'results'::text;
  v_res := v_res || pg_temp.rb_l('21', 'résultat limité aux champs autorisés : pas d''identifiant de compte, d''adresse, de ville habituelle ; poignée = disponibilité',
    t not like '%' || P2::text || '%' and t not like '%@%' and t not like '%home%' and t not like '%user_id%'
    and exists (select 1 from jsonb_array_elements(j->'results') x where (x->>'handle')::uuid = h2)
    and not exists (select 1 from jsonb_array_elements(j->'results') x where (x->>'handle')::uuid in (select user_id from public.rouler_profiles)), left(t, 200));
  v_res := v_res || pg_temp.rb_l('22', 'ceinture, club et années montrés seulement si la personne l''a choisi',
    exists (select 1 from jsonb_array_elements(j->'results') x where x->>'name' = 'Sarah B.' and x->>'belt' = 'bleue' and x->'club' = 'null'::jsonb and x->'years' = 'null'::jsonb)
    and exists (select 1 from jsonb_array_elements(j->'results') x where x->>'name' = 'Paul P.' and x->>'belt' = 'noire' and x->>'club' like 'RB club A%' and (x->>'years')::int = 15)
    and exists (select 1 from jsonb_array_elements(j->'results') x where x->>'name' = 'Lina M.' and x->'belt' = 'null'::jsonb), left(t, 200));
  v_res := v_res || pg_temp.rb_l('23', 'distance : tranche affichée, pas de distance exacte ; un créneau à Grigny est hors de 10 km de Vitry, trouvé à 25 km',
    not exists (select 1 from jsonb_array_elements(j->'results') x where x ? 'km' or x->>'band' is null)
    and pg_temp.rb_names(P5, 'select public.rouler_search(''{"insee":"94081","radius":10}''::jsonb)') not like '%Karim%'
    and pg_temp.rb_names(P5, 'select public.rouler_search(''{"insee":"94081","radius":25}''::jsonb)') like '%Karim%');
  v_res := v_res || pg_temp.rb_l('24', 'filtres discipline et type de roulage',
    pg_temp.rb_names(P3, 'select public.rouler_search(''{"insee":"91286","radius":10,"disc":"grappling_nogi"}''::jsonb)') = 'Omar I.'
    and pg_temp.rb_names(P3, 'select public.rouler_search(''{"insee":"91286","radius":10,"intensity":"intense"}''::jsonb)') = 'Omar I.'
    and pg_temp.rb_err(P3, 'select public.rouler_search(''{"insee":"91286","radius":10,"disc":"mma"}''::jsonb)') ilike '%discipline%');
  v_res := v_res || pg_temp.rb_l('25', 'filtre de niveau : seules les ceintures affichées comptent, dans la fourchette demandée',
    pg_temp.rb_names(P5, 'select public.rouler_search(''{"insee":"91286","radius":10,"belt_min":"bleue","belt_max":"violette"}''::jsonb)') = 'Nadia A.,Sarah B.'
    and pg_temp.rb_names(P5, 'select public.rouler_search(''{"insee":"91286","radius":10,"belt_min":"noire"}''::jsonb)') = 'Paul P.');

  -- ---------- Temps en commun : les cas de la maquette 8 (à Bordeaux, il est « 18:00 » = maintenant) ----------
  -- Les créneaux à venir sont calés sur la minute, comme ceux créés par les raccourcis ; Sam finit exactement 30 min après maintenant.
  insert into public.rouler_profiles (user_id, visibility, home_insee, disciplines, intensities, adult_declared_at, consent_at, safety_ack_at)
  select u, 'uzu', '33063', '{jjb_gi}', '{modere}', now(), now(), now() from unnest(array[K, L, SM, INS, JO]) u;
  insert into public.rouler_availabilities (user_id, insee, tz, starts_at, ends_at, disciplines, intensities, places) values
    (K,  '33063', 'Europe/Paris', now() - interval '30 minutes',  now_m + interval '120 minutes', '{jjb_gi}', '{modere}', '{open_mat}'),  -- Kevin 17:30 → 20:00
    (L,  '33063', 'Europe/Paris', now_m + interval '20 minutes',  now_m + interval '90 minutes',  '{jjb_gi}', '{modere}', '{open_mat}'),  -- Lou   18:20 → 19:30
    (SM, '33063', 'Europe/Paris', now() - interval '120 minutes', now() + interval '30 minutes',  '{jjb_gi}', '{modere}', '{open_mat}'),  -- Sam   16:00 → 18:30
    (INS, '33063', 'Europe/Paris', now_m + interval '90 minutes',  now_m + interval '210 minutes', '{jjb_gi}', '{modere}', '{open_mat}'),  -- Inès  19:30 → 21:30
    (JO, '33063', 'Europe/Paris', now_m + interval '30 minutes',  now_m + interval '89 minutes',  '{jjb_gi}', '{modere}', '{open_mat}');  -- Jo    18:30 → 19:29 (59 min)
  select id into hk from public.rouler_availabilities where user_id = K;
  t := pg_temp.rb_names(P4, 'select public.rouler_search(''{"insee":"33063","radius":10,"when":"now","minutes":60}''::jsonb)');
  v_res := v_res || pg_temp.rb_l('T1', '« Maintenant », 1 h : seulement le créneau déjà commencé avec 1 h devant lui (Kevin) ; Sam (30 min restantes) et Lou (pas commencé) exclus', t = 'Kevin T.', t);
  t := pg_temp.rb_names(P4, 'select public.rouler_search(''{"insee":"33063","radius":10,"when":"30","minutes":60}''::jsonb)');
  v_res := v_res || pg_temp.rb_l('T2', '« Dans 30 min », 1 h : Kevin et Lou ; Jo (59 min en commun) exclu', t = 'Kevin T.,Lou T.', t);
  t := pg_temp.rb_names(P4, 'select public.rouler_search(''{"insee":"33063","radius":10,"when":"60","minutes":60}''::jsonb)');
  v_res := v_res || pg_temp.rb_l('T3', '« Dans 1 h », 1 h : Kevin seul (Lou 30 min, Inès 30 min)', t = 'Kevin T.', t);
  t := pg_temp.rb_names(P4, 'select public.rouler_search(''{"insee":"33063","radius":10,"when":"120","minutes":60}''::jsonb)');
  v_res := v_res || pg_temp.rb_l('T4', '« Dans 2 h », 1 h : Inès seule (Kevin a fini)', t = 'Ines T.', t);
  t := pg_temp.rb_names(P4, 'select public.rouler_search(''{"insee":"33063","radius":10,"when":"240","minutes":60}''::jsonb)');
  v_res := v_res || pg_temp.rb_l('T5', '« Dans 4 h » : personne', t = '', t);
  t := pg_temp.rb_names(P4, format('select public.rouler_search(%L::jsonb)', jsonb_build_object('insee', '33063', 'radius', 10, 'when', 'custom', 'minutes', 60,
         'date', to_char((now_m + interval '2 hours') at time zone 'Europe/Paris', 'YYYY-MM-DD'), 'time', to_char((now_m + interval '2 hours') at time zone 'Europe/Paris', 'HH24:MI'))));
  v_res := v_res || pg_temp.rb_l('T6', '« Autre moment » saisi à l''heure locale (dans 2 h) : même résultat que « Dans 2 h »', t = 'Ines T.', t);
  v_res := v_res || pg_temp.rb_l('T7', 'temps commun de 30 min : « Maintenant » trouve Kevin et Sam ; « Dans 30 min » trouve aussi Jo',
    pg_temp.rb_names(P4, 'select public.rouler_search(''{"insee":"33063","radius":10,"when":"now","minutes":30}''::jsonb)') = 'Kevin T.,Sam T.'
    and pg_temp.rb_names(P4, 'select public.rouler_search(''{"insee":"33063","radius":10,"when":"30","minutes":30}''::jsonb)') = 'Jo T.,Kevin T.,Lou T.');
  j := pg_temp.rb_j(P4, 'select public.rouler_search(''{"insee":"33063","radius":10,"when":"now","minutes":60}''::jsonb)');
  v_res := v_res || pg_temp.rb_l('T8', 'résultat : horaire du partenaire, début et fin du temps commun, minutes en commun, fuseau du lieu ; aucun identifiant de compte',
    (j->'results'->0->>'common_minutes')::int = 60 and j->'results'->0 ? 'common_start' and j->'results'->0 ? 'starts_at' and j->'results'->0->>'tz' = 'Europe/Paris'
    and (j->>'required_minutes')::int = 60 and j::text not like '%' || K::text || '%', left(j::text, 200));
  e := pg_temp.rb_err(P4, 'select public.rouler_search(''{"insee":"33063","when":"now","minutes":45}''::jsonb)');
  v_res := v_res || pg_temp.rb_l('T9', 'temps commun hors 30 min / 1 h / 1 h 30 / 2 h : refusé', e ilike '%temps commun%', e);

  -- ---------- Mon créneau en déplacement : Karim (habite Lyon) à Bordeaux, Léa disponible ----------
  insert into public.rouler_profiles (user_id, visibility, home_insee, disciplines, intensities, adult_declared_at, consent_at, safety_ack_at)
  values (KB, 'uzu', '69123', '{jjb_gi}', '{modere}', now(), now(), now()), (LB, 'uzu', '33063', '{jjb_gi}', '{modere}', now(), now(), now());
  insert into public.rouler_availabilities (user_id, insee, tz, is_travel, starts_at, ends_at, disciplines, intensities, places) values
    (KB, '33063', 'Europe/Paris', true,  now_m + interval '60 minutes', now_m + interval '180 minutes', '{jjb_gi}', '{modere}', '{open_mat}'),   -- Karim 10:00 → 12:00
    (LB, '33063', 'Europe/Paris', false, now_m + interval '30 minutes', now_m + interval '150 minutes', '{jjb_gi}', '{modere}', '{open_mat}');   -- Léa   09:30 → 11:30
  select id into hkb from public.rouler_availabilities where user_id = KB;
  j := pg_temp.rb_j(KB, format('select public.rouler_search(%L::jsonb)', jsonb_build_object('when', 'slot', 'slot', hkb, 'minutes', 60)));
  v_res := v_res || pg_temp.rb_l('T10', '« Mon créneau » (Karim, Bordeaux, 2 h) avec 1 h minimum : recherche placée sur Bordeaux, Léa trouvée avec 1 h 30 en commun ; ville habituelle de Karim : Lyon',
    j->'commune'->>'nom' = 'Bordeaux'
    and exists (select 1 from jsonb_array_elements(j->'results') x where x->>'name' = 'Lea B.' and (x->>'common_minutes')::int = 90)
    and (select home_insee from public.rouler_profiles where user_id = KB) = '69123', left(j::text, 200));
  v_res := v_res || pg_temp.rb_l('T11', '« Mon créneau » avec 2 h minimum : Léa (1 h 30) n''est plus compatible ; à Lyon, Karim n''apparaît pas pendant son déplacement',
    pg_temp.rb_names(KB, format('select public.rouler_search(%L::jsonb)', jsonb_build_object('when', 'slot', 'slot', hkb, 'minutes', 120))) not like '%Lea%'
    and pg_temp.rb_names(LB, 'select public.rouler_search(''{"insee":"69123","radius":25,"when":"60","minutes":60}''::jsonb)') not like '%Karim%'
    and pg_temp.rb_names(LB, 'select public.rouler_search(''{"insee":"33063","radius":25,"when":"60","minutes":60}''::jsonb)') like '%Karim L.%');
  v_res := v_res || pg_temp.rb_l('T12', '« Mon créneau » d''un autre, ou commune changée : créneau refusé ; commune choisie respectée (Mérignac)',
    pg_temp.rb_err(LB, format('select public.rouler_search(%L::jsonb)', jsonb_build_object('when', 'slot', 'slot', hkb))) ilike '%introuvable%'
    and pg_temp.rb_j(KB, format('select public.rouler_search(%L::jsonb)', jsonb_build_object('when', 'slot', 'slot', hkb, 'insee', '33281')))->'commune'->>'nom' = 'Mérignac');

  -- ---------- Expiration à la minute, arrêt, prolongation, compteur ----------
  update public.rouler_availabilities set ends_at = now() - interval '1 minute' where id = hk;
  v_res := v_res || pg_temp.rb_l('T13', 'créneau fini il y a 1 min : absent tout de suite des résultats, sans attendre la tâche planifiée',
    pg_temp.rb_names(P4, 'select public.rouler_search(''{"insee":"33063","radius":10,"when":"now","minutes":30}''::jsonb)') = 'Sam T.');
  j := pg_temp.rb_j(P1, 'select public.rouler_me()');
  v_res := v_res || pg_temp.rb_l('T14', 'mes créneaux : partenaires compatibles comptés selon la même règle (club A, maintenant)',
    (select (x->>'compatible')::int from jsonb_array_elements(j->'availabilities') x where x->>'id' = hp1::text) = 3, left(j::text, 200));
  perform pg_temp.rb_j(P1, format('select public.rouler_end_availability(%L::uuid)', hp1b));
  perform pg_temp.rb_j(P1, format('select public.rouler_extend_availability(%L::uuid)', hp1));
  perform pg_temp.rb_j(P1, format('select public.rouler_extend_availability(%L::uuid)', hp1));
  perform pg_temp.rb_j(P1, format('select public.rouler_extend_availability(%L::uuid)', hp1));
  perform pg_temp.rb_j(P1, format('select public.rouler_extend_availability(%L::uuid)', hp1));
  e := pg_temp.rb_err(P1, format('select public.rouler_extend_availability(%L::uuid)', hp1));
  v_res := v_res || pg_temp.rb_l('T15', '« Je ne suis plus dispo » retire le créneau ; « Prolonger 30 min » jusqu''à 4 h, refusé au-delà',
    not exists (select 1 from jsonb_array_elements(pg_temp.rb_j(P1, 'select public.rouler_me()')->'availabilities') x where x->>'id' = hp1b::text)
    and (select ends_at = now_m + interval '4 hours' from public.rouler_availabilities where id = hp1) and e ilike '%4 h%', e);
  v_res := v_res || pg_temp.rb_l('T16', 'heure locale : heure inexistante (28 mars 2027, 02:30 à Paris) refusée ; heure doublée (25 oct. 2026, 02:30) = la première',
    pg_temp.rb_err(P1, 'select public.rouler_search(''{"insee":"91286","when":"custom","date":"2027-03-28","time":"02:30"}''::jsonb)') ilike '%changement d''heure%'
    and public.rouler_local_ts('2026-10-25', '02:30', 'Europe/Paris') = '2026-10-25 00:30:00+00'::timestamptz);

  -- ---------- Blocage ----------
  perform pg_temp.rb_j(P1, format('select to_jsonb(public.rouler_block(%L::uuid))', h2));
  v_res := v_res || pg_temp.rb_l('27', 'blocage : les deux personnes ne se voient plus, dans les deux sens ; se bloquer soi-même refusé',
    pg_temp.rb_names(P1, q10) not like '%Sarah%' and pg_temp.rb_names(P2, q10) not like '%Karim%'
    and exists (select 1 from public.user_blocks where blocker_id = P1 and blocked_id = P2)
    and pg_temp.rb_err(P2, format('select public.rouler_block(%L::uuid)', h2)) is not null);
  j := pg_temp.rb_j(P1, 'select public.rouler_my_blocks()');
  v_res := v_res || pg_temp.rb_l('27b', 'liste « ne plus voir » : prénom et initiale, clé opaque sans identifiant ; annuler rétablit la visibilité, clé d''un autre refusée',
    j->0->>'name' = 'Sarah B.' and j::text not like '%' || P2::text || '%' and j::text not like '%@%'
    and pg_temp.rb_err(P2, format('select public.rouler_unblock(%L)', j->0->>'key')) ilike '%introuvable%'
    and (pg_temp.rb_j(P1, format('select to_jsonb(public.rouler_unblock(%L))', j->0->>'key')))::text = 'true'
    and pg_temp.rb_names(P1, q10) like '%Sarah%', left(j::text, 200));
  perform pg_temp.rb_j(P1, format('select to_jsonb(public.rouler_block(%L::uuid))', h2));

  -- ---------- Signalement et pause automatique ----------
  v_res := v_res || pg_temp.rb_l('28', 'signalement : motif inconnu ou soi-même refusés',
    pg_temp.rb_err(P5, format('select public.rouler_report(%L::uuid, ''pasbeau'')', h3)) ilike '%motif%'
    and pg_temp.rb_err(P3, format('select public.rouler_report(%L::uuid, ''faux'')', h3)) is not null);
  perform pg_temp.rb_j(P5, format('select to_jsonb(public.rouler_report(%L::uuid, ''faux'', ''Profil douteux''))', h3));
  perform pg_temp.rb_j(P5, format('select to_jsonb(public.rouler_report(%L::uuid, ''faux''))', h3));
  perform pg_temp.rb_j(P4, format('select to_jsonb(public.rouler_report(%L::uuid, ''inapproprie''))', h3));
  v_res := v_res || pg_temp.rb_l('29', 'deux personnes ont signalé (une deux fois) : compté une seule fois par personne, profil toujours actif',
    (select count(*) from public.rouler_reports where target_id = P3) = 2 and (select status from public.rouler_profiles where user_id = P3) = 'active');
  perform pg_temp.rb_j(S3, 'select to_jsonb(true)');
  insert into public.rouler_profiles (user_id, visibility, home_insee, disciplines, intensities, adult_declared_at, consent_at, safety_ack_at)
  values (S3, 'clubs', '91286', '{jjb_gi}', '{technique}', now(), now(), now());
  perform pg_temp.rb_j(S3, format('select to_jsonb(public.rouler_report(%L::uuid, ''harcelement''))', h3));
  v_res := v_res || pg_temp.rb_l('30', '3e personne différente en 30 jours : pause automatique, plus visible, sa recherche indique la pause',
    (select status from public.rouler_profiles where user_id = P3) = 'paused' and pg_temp.rb_names(P4, q10) not like '%Nadia%'
    and pg_temp.rb_names(P3, q10) = 'need:paused'
    and exists (select 1 from public.dir_moderation_log where action = 'rouler.paused_auto'));

  -- ---------- Référent ----------
  v_res := v_res || pg_temp.rb_l('31', 'signalements : réservés au référent (responsable de club, professeur, adhérent refusés)',
    pg_temp.rb_err(OA, 'select public.rouler_admin_reports()') ilike '%référent%' and pg_temp.rb_err(PR, 'select public.rouler_admin_reports()') is not null
    and pg_temp.rb_err(P1, format('select public.rouler_admin_resolve(%L::uuid, ''restore'')', gen_random_uuid())) is not null);
  j := pg_temp.rb_j(R, 'select public.rouler_admin_reports(''open'')');
  v_res := v_res || pg_temp.rb_l('32', 'référent : voit la personne signalée (prénom et initiale), le nombre, les motifs ; aucune adresse électronique ni identité des auteurs',
    exists (select 1 from jsonb_array_elements(j) x where x->>'name' = 'Nadia A.' and (x->>'reporters')::int = 3 and x->>'profile_status' = 'paused' and x->'reasons' ? 'faux')
    and j::text not like '%@%' and j::text not like '%' || P5::text || '%' and j::text not like '%Lina%', left(j::text, 200));
  perform pg_temp.rb_j(R, format('select to_jsonb(public.rouler_admin_resolve(%L::uuid, ''restore''))', (j->0->>'key')));
  v_res := v_res || pg_temp.rb_l('33', 'référent rétablit : profil actif de nouveau, signalements clos, décision au journal',
    (select status from public.rouler_profiles where user_id = P3) = 'active' and not exists (select 1 from public.rouler_reports where target_id = P3 and status = 'open')
    and exists (select 1 from public.dir_moderation_log where action = 'rouler.restore')
    and pg_temp.rb_names(P4, q10) like '%Nadia%');
  perform pg_temp.rb_j(S1, format('select to_jsonb(public.rouler_report(%L::uuid, ''autre''))', h4));
  perform pg_temp.rb_j(R, format('select to_jsonb(public.rouler_admin_resolve(%L::uuid, ''keep''))', (select id from public.rouler_reports where target_id = P4 and status = 'open')));
  v_res := v_res || pg_temp.rb_l('34', 'référent maintient la pause : profil en pause même avec un seul signalement',
    (select status from public.rouler_profiles where user_id = P4) = 'paused' and exists (select 1 from public.dir_moderation_log where action = 'rouler.keep'));
  insert into public.rouler_reports (reporter_id, target_id, reason, created_at) select S2, P5, 'autre', now() from generate_series(1, 10);
  e := pg_temp.rb_err(S2, format('select public.rouler_report(%L::uuid, ''autre'')', hpr));
  v_res := v_res || pg_temp.rb_l('35', 'limite : 10 signalements par jour et par personne', e ilike '%signalements%', e);

  -- ---------- Fin, retrait, suppression ----------
  v_res := v_res || pg_temp.rb_l('36', 'arrêter le créneau d''un autre : refusé ; arrêter le sien : disparaît de la recherche',
    pg_temp.rb_err(P1, format('select public.rouler_end_availability(%L::uuid)', h5)) ilike '%introuvable%'
    and (pg_temp.rb_j(P5, format('select public.rouler_end_availability(%L::uuid)', h5))->'availabilities') = '[]'::jsonb
    and pg_temp.rb_names(PR, q10) not like '%Lina%');
  perform pg_temp.rb_j(PR, 'select public.rouler_set_visibility(''hidden'')');
  v_res := v_res || pg_temp.rb_l('37', 'redevenir invisible : disparaît immédiatement', pg_temp.rb_names(P2, q10) not like '%Paul%');
  perform pg_temp.rb_j(P2, 'select to_jsonb(public.rouler_delete_profile())');
  v_res := v_res || pg_temp.rb_l('38', 'supprimer son profil de roulage : profil et créneaux effacés',
    not exists (select 1 from public.rouler_profiles where user_id = P2) and not exists (select 1 from public.rouler_availabilities where user_id = P2)
    and pg_temp.rb_j(P2, 'select public.rouler_me()')->'profile' = 'null'::jsonb);
  delete from auth.users where id = P1;
  v_res := v_res || pg_temp.rb_l('39', 'suppression du compte : profil, créneaux et recherches effacés en cascade',
    not exists (select 1 from public.rouler_profiles where user_id = P1) and not exists (select 1 from public.rouler_availabilities where user_id = P1)
    and not exists (select 1 from public.rouler_search_log where user_id = P1));

  -- ---------- Limites et expiration ----------
  insert into public.rouler_search_log (user_id, at) select P5, now() from generate_series(1, 30);
  e := pg_temp.rb_err(P5, q10);
  v_res := v_res || pg_temp.rb_l('40', 'limite : 30 recherches par heure', e ilike '%recherches%', e);
  update public.rouler_availabilities set starts_at = now() - interval '3 hours', ends_at = now() - interval '1 minute' where id = h3;
  update public.rouler_search_log set at = now() - interval '2 days' where user_id = P5;
  update public.rouler_profiles set last_active_at = now() - interval '7 months' where user_id = S1;
  j := public.rouler_expire();
  v_res := v_res || pg_temp.rb_l('41', 'tâche d''expiration : créneau fini marqué expiré, recherches de plus de 24 h purgées, profil inactif 6 mois redevenu invisible',
    (select status from public.rouler_availabilities where id = h3) = 'expired' and not exists (select 1 from public.rouler_search_log where user_id = P5)
    and (select visibility from public.rouler_profiles where user_id = S1) = 'hidden' and pg_temp.rb_names(P4, q10) not like '%Nadia%', j::text);
  update public.dir_moderators set active = false, revoked_at = now() where user_id = R;
  v_res := v_res || pg_temp.rb_l('42', 'rôle de référent retiré : plus d''accès aux signalements',
    pg_temp.rb_err(R, 'select public.rouler_admin_reports()') ilike '%référent%'
    and pg_temp.rb_err(R, format('select public.rouler_admin_resolve(%L::uuid, ''restore'')', gen_random_uuid())) is not null);

  raise exception using message = 'rb_annulation';
  exception when others then
    if sqlerrm <> 'rb_annulation' then v_res := v_res || pg_temp.rb_l('!', 'ERREUR INATTENDUE : contrôle interrompu (tout a été annulé)', false, sqlerrm); end if;
  end;     -- ======== ici, tout ce qui précède est annulé ========

  select count(*) into n from auth.users where email like 'rb-test-' || v_tag || '-%';
  v_res := v_res || pg_temp.rb_l('Fin', 'annulation : aucune personne, profil, disponibilité, signalement ni ligne de journal de test ne reste',
    n = 0 and (select count(*) from public.dir_moderation_log) = v_log_before and not exists (select 1 from public.clubs where name like 'RB club %'), n::text);
  v_res := v_res || pg_temp.rb_l('Fin2', 'clubs, adhésions, profils, ceintures, blocages, annuaire et module de roulage identiques avant et après', pg_temp.rb_snap() = v_before);
  return query
    select x->>'n', x->>'test', case when (x->>'ok')::boolean then '✔' else '✖' end, x->>'detail'
    from jsonb_array_elements(v_res) with ordinality t(x, i) order by i;
end $f$;

select * from pg_temp.rb_controle();
