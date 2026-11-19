-- =====================================================================================
-- UZU — Class Media : CONTRÔLES DE SÉCURITÉ sur la base de TEST, sans compte réel ni installation
--
-- À coller en entier dans l'éditeur SQL de la base de TEST (ntypsrdwxrkanahhuixx), puis « Run ».
-- Ce que fait ce fichier :
--   1. il crée des personnes FICTIVES (responsable, professeurs, élèves, autre club, sans club),
--      un club fictif, deux groupes, des séances et des médias (sans aucun fichier réel) ;
--   2. il se met dans la peau de chacune et vérifie ce qu'elle peut voir ou faire ;
--   3. il ANNULE TOUT à la fin : rien ne reste dans la base (la dernière ligne le vérifie).
-- Aucun jeton, aucun mot de passe, aucun secret n'est affiché.
-- Refuse de tourner si la base n'est pas reconnue comme la base de test.
-- Couvre la partie « base de données » des 21 tests (1 à 15, R-1 à R-6). Restent à faire dans
-- l'application : 10 (format réel vérifié par la fonction), R-4 (pas de cache), lecture iPhone.
-- =====================================================================================

create or replace function pg_temp.cm_as(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then
    perform set_config('role', 'none', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;

-- Exécute une requête au nom d'une personne ; renvoie son résultat (jsonb)
create or replace function pg_temp.cm_j(p_uid uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.cm_as(p_uid);
  execute p_sql into v;
  perform pg_temp.cm_as(null);
  return v;
end $$;

-- Exécute une requête au nom d'une personne ; renvoie NULL si elle passe, sinon le message de refus
create or replace function pg_temp.cm_err(p_uid uuid, p_sql text) returns text language plpgsql as $$
begin
  perform pg_temp.cm_as(p_uid);
  execute p_sql;
  perform pg_temp.cm_as(null);
  return null;
exception when others then
  return coalesce(nullif(sqlerrm, ''), 'refusé');
end $$;

-- Contrôle de lecture fait par la fonction serveur, à partir d'un jeton
create or replace function pg_temp.cm_check(p_token text) returns jsonb language sql as $$
  select public.media_stream_check(encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex'))
$$;

create or replace function pg_temp.cm_l(p_n text, p_test text, p_ok boolean, p_detail text default '') returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('n', p_n, 'test', p_test, 'ok', coalesce(p_ok, false), 'detail', case when coalesce(p_ok, false) then '' else left(coalesce(p_detail, ''), 160) end))
$$;

create or replace function pg_temp.cm_controle() returns table (num text, test text, resultat text, detail text)
language plpgsql as $f$
declare
  v_res jsonb := '[]';
  v_url text; v_tag text := left(replace(gen_random_uuid()::text, '-', ''), 8);
  A uuid := gen_random_uuid(); I1 uuid := gen_random_uuid(); I2 uuid := gen_random_uuid(); L1 uuid := gen_random_uuid();
  B1 uuid := gen_random_uuid(); B2 uuid := gen_random_uuid(); D1 uuid := gen_random_uuid(); X1 uuid := gen_random_uuid();
  CA uuid; GI uuid; NG uuid; sA uuid; sDraft uuid;
  j jsonb; e text; r1 jsonb; r2 jsonb; r3 jsonb; rd jsonb; pend jsonb; rm jsonb; tk text; tk2 text; k jsonb; k2 jsonb; n int;
  v_today date := current_date;
begin
  -- Garde-fou : uniquement la base de test
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' or v_url like '%ixkewdxtuhxfiodwhhzr%' then
    return query select '!'::text, 'Arrêt : cette base n''est pas reconnue comme la base de test. Rien n''a été fait.'::text, '✖'::text, ''::text; return;
  end if;
  if to_regprocedure('public.media_ticket(uuid,integer)') is null then
    return query select '!'::text, 'Arrêt : Class Media (uzu-13) n''est pas installé sur cette base.'::text, '✖'::text, ''::text; return;
  end if;

  begin   -- ======== tout ce bloc est annulé à la fin ========

  -- ---------- Mise en place fictive ----------
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 'cm-test-' || v_tag || '-' || s || '@uzu.invalid', jsonb_build_object('name', 'CM test ' || s)
  from (values (A, 'resp'), (I1, 'prof1'), (I2, 'prof2'), (L1, 'respgroupe'), (B1, 'eleve1'), (B2, 'eleve2'), (D1, 'autreclub'), (X1, 'sansclub')) t(u, s);
  perform pg_temp.cm_j(A, format('select public.create_new_club(%L, %L)', 'CM test ' || v_tag, upper('CMT-' || v_tag)));
  perform pg_temp.cm_j(D1, format('select public.create_new_club(%L, %L)', 'CM test autre ' || v_tag, upper('CMA-' || v_tag)));
  select academy_id into CA from public.academy_members where user_id = A;
  update public.clubs set schedule = '[{"id":"x1","d":1,"s":"19:00","e":"20:30","t":"Adultes Gi"},{"id":"x2","d":3,"s":"19:00","e":"20:30","t":"No-Gi"}]'::jsonb where id = CA;
  insert into public.academy_sections (academy_id, name, discipline) values (CA, 'CM test Adultes Gi', 'jjb_gi') returning id into GI;
  insert into public.academy_sections (academy_id, name, discipline) values (CA, 'CM test No-Gi', 'grappling_nogi') returning id into NG;
  insert into public.course_meta (academy_id, course_key, section_id, discipline) values (CA, 'x1', GI, 'jjb_gi'), (CA, 'x2', NG, 'grappling_nogi');
  insert into public.profiles (user_id, club_id, role, display_name)
  select u, CA, rl, 'CM test' from (values (I1, 'coach'), (I2, 'coach'), (L1, 'coach'), (B1, 'student'), (B2, 'student')) t(u, rl)
  on conflict (user_id) do update set club_id = excluded.club_id, role = excluded.role;
  insert into public.academy_members (academy_id, user_id, role, display_name, section_id) values
    (CA, I1, 'instructor', 'CM test prof1', null), (CA, I2, 'instructor', 'CM test prof2', null), (CA, L1, 'section_lead', 'CM test respgroupe', NG),
    (CA, B1, 'student', 'CM test eleve1', GI), (CA, B2, 'student', 'CM test eleve2', NG);
  insert into public.course_staff (academy_id, course_key, member_id, assignment_role)
  select CA, 'x1', id, 'lead' from public.academy_members where user_id = I1 and academy_id = CA;
  perform pg_temp.cm_j(A, format('select public.set_member_permissions(%L::uuid, %L::jsonb)',
    (select id from public.academy_members where user_id = I1 and academy_id = CA),
    '[{"r":"class_journal","a":"view","s":"assigned_courses"},{"r":"class_journal","a":"create","s":"assigned_courses"},{"r":"class_journal","a":"approve","s":"assigned_courses"}]'));
  j := pg_temp.cm_j(I1, format('select public.journal_save_session(null, %L::jsonb, true)',
    jsonb_build_object('section_id', GI, 'course_key', 'x1', 'session_date', v_today, 'discipline_id', 'jjb_gi', 'theme', 'CM test séance', 'techniques', '[]'::jsonb)));
  sA := (j->>'id')::uuid;
  j := pg_temp.cm_j(I1, format('select public.journal_save_session(null, %L::jsonb, false)',
    jsonb_build_object('section_id', GI, 'course_key', 'x1', 'session_date', v_today, 'discipline_id', 'jjb_gi', 'theme', 'CM test brouillon', 'techniques', '[]'::jsonb)));
  sDraft := (j->>'id')::uuid;
  v_res := v_res || pg_temp.cm_l('0', 'mise en place fictive : club, 2 groupes, 8 personnes, 1 séance publiée, 1 brouillon', CA is not null and GI is not null and sA is not null and sDraft is not null);

  -- ---------- Ajout de médias ----------
  e := pg_temp.cm_err(B1, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 200000, true, false)', sA));
  v_res := v_res || pg_temp.cm_l('6', 'adhérent : ne peut pas ajouter de média', e is not null, 'accepté à tort');
  e := pg_temp.cm_err(I1, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 1000, false, false)', sA));
  v_res := v_res || pg_temp.cm_l('11', 'sans confirmation de l''accord des personnes : refusé', e ilike '%accord%', coalesce(e, 'accepté à tort'));
  e := pg_temp.cm_err(I1, format('select public.media_reserve(%L::uuid, ''video'', ''video/mp4'', 52428801, true, false)', sA));
  v_res := v_res || pg_temp.cm_l('9', 'vidéo de plus de 50 Mo : refusée dès la réservation', e ilike '%50 Mo%', coalesce(e, 'accepté à tort'));
  e := pg_temp.cm_err(I2, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 1000, true, false)', sA));
  v_res := v_res || pg_temp.cm_l('6b', 'professeur sans droit sur la séance : ne peut pas ajouter', e is not null, 'accepté à tort');

  r1 := pg_temp.cm_j(I1, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 200000, true, false)', sA));
  e := pg_temp.cm_err(I1, format('insert into storage.objects (bucket_id, name) values (''class-media'', %L)', CA::text || '/' || sA::text || '/autre.jpg'));
  v_res := v_res || pg_temp.cm_l('E1', 'stockage : envoi refusé ailleurs qu''à l''emplacement réservé', e is not null, 'accepté à tort');
  e := pg_temp.cm_err(B1, format('insert into storage.objects (bucket_id, name) values (''class-media'', %L)', r1->>'path'));
  v_res := v_res || pg_temp.cm_l('E2', 'stockage : envoi refusé à l''adhérent', e is not null, 'accepté à tort');
  e := pg_temp.cm_err(I1, format('insert into storage.objects (bucket_id, name) values (''class-media'', %L)', r1->>'path'));
  v_res := v_res || pg_temp.cm_l('E3', 'stockage : envoi accepté pour l''auteur, à l''emplacement réservé', e is null, e);
  j := public.media_mark_ready((r1->>'id')::uuid, 'image/png', 200000);
  v_res := v_res || pg_temp.cm_l('10', '(partie base) type réel différent du type annoncé : refusé', (j->>'ok')::boolean is false, j::text);
  j := public.media_mark_ready((r1->>'id')::uuid, 'image/jpeg', 200000);
  v_res := v_res || pg_temp.cm_l('10b', 'vérification réussie, groupe sans mineurs : validé automatiquement', j->>'validation' = 'approved', j::text);
  v_res := v_res || pg_temp.cm_l('S1', 'fonctions réservées au serveur : refusées aux comptes connectés',
    pg_temp.cm_err(B1, 'select public.media_stream_check(''00'')') is not null
    and pg_temp.cm_err(A, format('select public.media_mark_ready(%L::uuid, ''image/jpeg'', 1)', r1->>'id')) is not null
    and pg_temp.cm_err(A, 'select public.media_reconcile(null, 10)') is not null
    and pg_temp.cm_err(A, 'select public.class_media_cron_ok(repeat(''0'', 64))') is not null);

  -- ---------- Lecture ----------
  j := pg_temp.cm_j(B1, format('select public.session_media(%L::uuid)', sA));
  v_res := v_res || pg_temp.cm_l('1', 'adhérent du groupe : voit le média de son groupe', jsonb_array_length(coalesce(j->'items', '[]')) = 1 and j->'items'->0->>'id' = r1->>'id', j::text);
  v_res := v_res || pg_temp.cm_l('1b', 'liste de l''adhérent : aucun chemin de fichier', position(CA::text || '/' in coalesce(j::text, '')) = 0);
  k := pg_temp.cm_j(B1, format('select public.media_ticket(%L::uuid)', r1->>'id')); tk := k->>'token';
  v_res := v_res || pg_temp.cm_l('J1', 'jeton de lecture : 15 min au plus, seule son empreinte est gardée',
    tk ~ '^[0-9a-f]{64}$' and (k->>'expires_in')::int <= 900
    and not exists (select 1 from public.class_media_tickets where token_hash = tk)
    and exists (select 1 from public.class_media_tickets where token_hash = encode(sha256(convert_to(tk, 'UTF8')), 'hex')), (k - 'token')::text);
  v_res := v_res || pg_temp.cm_l('1c', 'contrôle de lecture du serveur : autorisé', (pg_temp.cm_check(tk)->>'ok')::boolean, (pg_temp.cm_check(tk) - 'path')::text);
  v_res := v_res || pg_temp.cm_l('2', 'adhérent d''un autre groupe : ni liste ni jeton',
    pg_temp.cm_err(B2, format('select public.session_media(%L::uuid)', sA)) is not null and pg_temp.cm_err(B2, format('select public.media_ticket(%L::uuid)', r1->>'id')) is not null);
  v_res := v_res || pg_temp.cm_l('5', 'personne d''un autre club ou sans club : refusée',
    pg_temp.cm_err(D1, format('select public.session_media(%L::uuid)', sA)) is not null and pg_temp.cm_err(D1, format('select public.media_ticket(%L::uuid)', r1->>'id')) is not null
    and pg_temp.cm_err(X1, format('select public.media_ticket(%L::uuid)', r1->>'id')) is not null);
  v_res := v_res || pg_temp.cm_l('R-5', 'aucune lecture directe des fichiers (donc aucun lien signé), même pour l''équipe',
    (pg_temp.cm_j(B1, 'select to_jsonb(count(*)) from storage.objects where bucket_id like ''class-media%''')::int = 0)
    and (pg_temp.cm_j(A, 'select to_jsonb(count(*)) from storage.objects where bucket_id like ''class-media%''')::int = 0)
    and (pg_temp.cm_j(I1, 'select to_jsonb(count(*)) from storage.objects where bucket_id like ''class-media%''')::int = 0));

  -- ---------- Brouillon ----------
  rd := pg_temp.cm_j(I1, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 200000, true, false)', sDraft));
  perform public.media_mark_ready((rd->>'id')::uuid, 'image/jpeg', 200000);
  v_res := v_res || pg_temp.cm_l('3', 'séance en brouillon : rien pour l''adhérent',
    pg_temp.cm_err(B1, format('select public.session_media(%L::uuid)', sDraft)) is not null and pg_temp.cm_err(B1, format('select public.media_ticket(%L::uuid)', rd->>'id')) is not null);

  -- ---------- Retrait refusé, limite de 4 ----------
  v_res := v_res || pg_temp.cm_l('7', 'adhérent ou professeur sans droit : ne peut pas retirer un média',
    pg_temp.cm_err(B1, format('select public.media_remove(%L::uuid, ''x'')', r1->>'id')) is not null and pg_temp.cm_err(I2, format('select public.media_remove(%L::uuid, ''x'')', r1->>'id')) is not null);
  r2 := pg_temp.cm_j(I1, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 200000, true, false)', sA));
  perform public.media_mark_ready((r2->>'id')::uuid, 'image/jpeg', 200000);
  r3 := pg_temp.cm_j(I1, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 200000, true, false)', sA));
  perform public.media_mark_ready((r3->>'id')::uuid, 'image/jpeg', 200000);
  pend := pg_temp.cm_j(I1, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 200000, true, false)', sA));
  e := pg_temp.cm_err(A, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 200000, true, false)', sA));
  v_res := v_res || pg_temp.cm_l('8', 'cinquième média refusé (une réservation en cours compte)', e ilike '%Limite%', coalesce(e, 'accepté à tort'));

  -- ---------- R-1 / 4, R-3, R-6 : dépublication et republication ----------
  tk := pg_temp.cm_j(B1, format('select public.media_ticket(%L::uuid)', r1->>'id'))->>'token';
  k := pg_temp.cm_check(tk);
  perform pg_temp.cm_j(I1, format('select to_jsonb(public.journal_set_status(%L::uuid, ''depublie''))', sA));
  k2 := pg_temp.cm_check(tk);
  v_res := v_res || pg_temp.cm_l('4 / R-1', 'dépublication : la requête suivante est refusée, avec le même jeton', (k->>'ok')::boolean and k2->>'code' = 'denied', (k2 - 'path')::text);
  k2 := pg_temp.cm_check(tk);
  v_res := v_res || pg_temp.cm_l('R-3', 'la même requête rejouée : toujours refusée (jeton annulé)', k2->>'code' = 'revoked', (k2 - 'path')::text);
  for j in select * from jsonb_array_elements(public.media_reconcile(sA, 50)) loop
    if j->>'op' = 'move' then perform public.media_set_location((j->>'media')::uuid, j->>'to_location'); end if;
  end loop;
  perform pg_temp.cm_j(I1, format('select to_jsonb(public.journal_set_status(%L::uuid, ''publie''))', sA));
  for j in select * from jsonb_array_elements(public.media_reconcile(sA, 50)) loop
    if j->>'op' = 'move' then perform public.media_set_location((j->>'media')::uuid, j->>'to_location'); end if;
  end loop;
  tk2 := pg_temp.cm_j(B1, format('select public.media_ticket(%L::uuid)', r1->>'id'))->>'token';
  v_res := v_res || pg_temp.cm_l('R-6', 'republication : l''ancien jeton reste refusé, un nouveau jeton fonctionne',
    (pg_temp.cm_check(tk)->>'ok')::boolean is false and (pg_temp.cm_check(tk2)->>'ok')::boolean, (pg_temp.cm_check(tk2) - 'path')::text);

  -- ---------- R-2 : coupures pendant la lecture ----------
  tk := pg_temp.cm_j(B1, format('select public.media_ticket(%L::uuid)', r1->>'id'))->>'token';
  k := pg_temp.cm_check(tk);
  perform pg_temp.cm_j(A, format('select to_jsonb(public.set_student_groups(%L::uuid, %L::uuid, ''{}''::uuid[]))', B1, NG));
  k2 := pg_temp.cm_check(tk);
  v_res := v_res || pg_temp.cm_l('R-2a', 'élève retiré du groupe : refus dès la requête suivante', (k->>'ok')::boolean and (k2->>'ok')::boolean is false, (k2 - 'path')::text);
  perform pg_temp.cm_j(A, format('select to_jsonb(public.set_student_groups(%L::uuid, %L::uuid, ''{}''::uuid[]))', B1, GI));

  tk := pg_temp.cm_j(B1, format('select public.media_ticket(%L::uuid)', r2->>'id'))->>'token';
  k := pg_temp.cm_check(tk);
  perform pg_temp.cm_j(I1, format('select to_jsonb(public.media_remove(%L::uuid, ''test''))', r2->>'id'));
  k2 := pg_temp.cm_check(tk);
  j := pg_temp.cm_j(B1, format('select public.session_media(%L::uuid)', sA));
  v_res := v_res || pg_temp.cm_l('13 / R-2b', 'média retiré par l''équipe : refus dès la requête suivante, disparu de la liste',
    (k->>'ok')::boolean and (k2->>'ok')::boolean is false and not coalesce(j->'items', '[]') @> jsonb_build_array(jsonb_build_object('id', r2->>'id')), (k2 - 'path')::text);

  tk := pg_temp.cm_j(B1, format('select public.media_ticket(%L::uuid)', r3->>'id'))->>'token';
  k := pg_temp.cm_check(tk);
  perform pg_temp.cm_j(B1, format('select to_jsonb(public.media_request_removal(%L::uuid, ''test''))', r3->>'id'));
  k2 := pg_temp.cm_check(tk);
  v_res := v_res || pg_temp.cm_l('R-2c', 'demande de retrait par l''adhérent : média masqué, refus dès la requête suivante', (k->>'ok')::boolean and (k2->>'ok')::boolean is false, (k2 - 'path')::text);

  -- ---------- 14 : expiration ----------
  k := pg_temp.cm_j(B1, format('select public.media_ticket(%L::uuid, 30)', r1->>'id')); tk := k->>'token';
  update public.class_media_tickets set expires_at = now() - interval '1 second' where token_hash = encode(sha256(convert_to(tk, 'UTF8')), 'hex');
  k2 := pg_temp.cm_check(tk);
  v_res := v_res || pg_temp.cm_l('14', 'jeton expiré : plus d''accès', (k->>'expires_in')::int = 30 and k2->>'code' = 'expired', k2::text);

  -- ---------- 15 : autre club ----------
  v_res := v_res || pg_temp.cm_l('15', 'autre club : ni ajout, ni retrait, ni validation, ni demande de retrait, ni réglage des mineurs',
    pg_temp.cm_err(D1, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 1000, true, false)', sA)) is not null
    and pg_temp.cm_err(D1, format('select public.media_remove(%L::uuid, '''')', r1->>'id')) is not null
    and pg_temp.cm_err(D1, format('select public.media_validate(%L::uuid, ''rejected'', '''')', r1->>'id')) is not null
    and pg_temp.cm_err(D1, format('select public.media_request_removal(%L::uuid, '''')', r1->>'id')) is not null
    and pg_temp.cm_err(D1, format('select public.set_section_minors(%L::uuid, false)', GI)) is not null);

  -- ---------- Groupe de mineurs : R-2d, 12, D4 ----------
  v_res := v_res || pg_temp.cm_l('V4', 'professeur sans le droit : ne peut pas déclarer un groupe de mineurs',
    pg_temp.cm_err(I1, format('select public.set_section_minors(%L::uuid, true)', GI)) is not null);
  tk := pg_temp.cm_j(B1, format('select public.media_ticket(%L::uuid)', r1->>'id'))->>'token';
  k := pg_temp.cm_check(tk);
  perform pg_temp.cm_j(A, format('select to_jsonb(public.set_section_minors(%L::uuid, true))', GI));
  k2 := pg_temp.cm_check(tk);
  j := pg_temp.cm_j(B1, format('select public.session_media(%L::uuid)', sA));
  v_res := v_res || pg_temp.cm_l('R-2d', 'groupe passé en mineurs : médias remis en attente, refus dès la requête suivante',
    (k->>'ok')::boolean and (k2->>'ok')::boolean is false and jsonb_array_length(coalesce(j->'items', '[]')) = 0, (k2 - 'path')::text);
  perform pg_temp.cm_j(I1, format('select to_jsonb(public.media_remove(%L::uuid, ''''))', pend->>'id'));
  e := pg_temp.cm_err(I1, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 1000, true, false)', sA));
  v_res := v_res || pg_temp.cm_l('12', 'groupe de mineurs : sans la confirmation des autorisations écrites, refusé', e ilike '%représentants légaux%', coalesce(e, 'accepté à tort'));
  rm := pg_temp.cm_j(I1, format('select public.media_reserve(%L::uuid, ''photo'', ''image/jpeg'', 1000, true, true)', sA));
  j := public.media_mark_ready((rm->>'id')::uuid, 'image/jpeg', 1000);
  v_res := v_res || pg_temp.cm_l('D4', 'groupe de mineurs : média en attente de validation, invisible pour l''adhérent',
    j->>'validation' = 'pending_validation' and pg_temp.cm_err(B1, format('select public.media_ticket(%L::uuid)', rm->>'id')) is not null, j::text);
  v_res := v_res || pg_temp.cm_l('D4b', 'validation refusée sans le droit « Publier »',
    pg_temp.cm_err(I2, format('select public.media_validate(%L::uuid, ''approved'', '''')', rm->>'id')) is not null
    and pg_temp.cm_err(B1, format('select public.media_validate(%L::uuid, ''approved'', '''')', rm->>'id')) is not null);
  perform pg_temp.cm_j(I1, format('select to_jsonb(public.media_validate(%L::uuid, ''approved'', ''test''))', rm->>'id'));
  v_res := v_res || pg_temp.cm_l('D4c', 'après validation explicite : visible pour l''adhérent',
    pg_temp.cm_err(B1, format('select public.media_ticket(%L::uuid)', rm->>'id')) is null);

  raise exception using message = 'cm_annulation';
  exception when others then
    if sqlerrm <> 'cm_annulation' then
      v_res := v_res || pg_temp.cm_l('!', 'ERREUR INATTENDUE : contrôle interrompu (tout a été annulé)', false, sqlerrm);
    end if;
  end;     -- ======== ici, tout ce qui précède est annulé ========

  select count(*) into n from auth.users where email like 'cm-test-' || v_tag || '-%';
  v_res := v_res || pg_temp.cm_l('Fin', 'annulation : aucune personne, club, séance ni média de test ne reste dans la base',
    n = 0 and not exists (select 1 from public.clubs where invite_code in (upper('CMT-' || v_tag), upper('CMA-' || v_tag))), n::text || ' personne(s) restante(s)');

  return query
    select x->>'n', x->>'test', case when (x->>'ok')::boolean then '✔' else '✖' end, x->>'detail'
    from jsonb_array_elements(v_res) with ordinality t(x, i) order by i;
end $f$;

select * from pg_temp.cm_controle();
