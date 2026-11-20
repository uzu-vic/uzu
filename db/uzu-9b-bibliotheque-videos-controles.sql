-- =====================================================================================
-- UZU — Bibliothèque, vidéos pédagogiques (uzu-9b) : CONTRÔLES sur la base de TEST, sans compte réel
--
-- À coller en entier dans l'éditeur SQL de la base de TEST (ntypsrdwxrkanahhuixx), APRÈS uzu-9b, puis « Run ».
--   1. crée des personnes et un club FICTIFS ;
--   2. se met dans la peau de chacun et vérifie ce qu'il peut voir ou faire ;
--   3. ANNULE TOUT à la fin (dernière ligne) : aucune personne, vidéo ou fichier de test ne reste.
-- Vérifie aussi que les vidéos pédagogiques déjà enregistrées, leurs références et les règles
-- existantes sont identiques avant et après. Refuse de tourner hors de la base de test.
-- =====================================================================================

create or replace function pg_temp.lv_as(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then
    perform set_config('role', 'none', true); perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;
create or replace function pg_temp.lv_j(p_uid uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb; begin perform pg_temp.lv_as(p_uid); execute p_sql into v; perform pg_temp.lv_as(null); return v; end $$;
create or replace function pg_temp.lv_err(p_uid uuid, p_sql text) returns text language plpgsql as $$
begin perform pg_temp.lv_as(p_uid); execute p_sql; perform pg_temp.lv_as(null); return null;
exception when others then return coalesce(nullif(sqlerrm, ''), 'refusé'); end $$;
create or replace function pg_temp.lv_l(p_n text, p_test text, p_ok boolean, p_detail text default '') returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('n', p_n, 'test', p_test, 'ok', coalesce(p_ok, false), 'detail', case when coalesce(p_ok, false) then '' else left(coalesce(p_detail, ''), 160) end))
$$;
create or replace function pg_temp.lv_snap() returns text language sql as $$
  select md5(coalesce((select string_agg(id::text||name||coalesce(metadata::text,'')||coalesce(updated_at::text,''), '|' order by name) from storage.objects where bucket_id = 'videos' and name not like '%/lib/%'), '')
          || coalesce((select string_agg(path||data::text, '|' order by path) from public.docs where path like 'videos/%'), '')
          || coalesce((select string_agg(policyname||cmd||coalesce(qual,'')||coalesce(with_check,''), '|' order by policyname) from pg_policies where schemaname = 'storage' and policyname not like 'uzu_lib_video%'), '')
          || coalesce((select row(id, public, file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'videos'), ''))
$$;

create or replace function pg_temp.lv_controle() returns table (num text, test text, resultat text, detail text)
language plpgsql as $f$
declare
  v_res jsonb := '[]'; v_url text; v_tag text := left(replace(gen_random_uuid()::text, '-', ''), 8); v_before text := pg_temp.lv_snap();
  A uuid := gen_random_uuid(); I1 uuid := gen_random_uuid(); I2 uuid := gen_random_uuid(); B1 uuid := gen_random_uuid(); D1 uuid := gen_random_uuid(); X1 uuid := gen_random_uuid();
  CA uuid; j jsonb; e text; v1 jsonb; v2 jsonb; v3 jsonb; vb jsonb; n int;
  res text := 'select public.library_video_reserve(%L, %L, %L, %s, %L, %s, %L::uuid)';
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' then
    return query select '!'::text, 'Arrêt : cette base n''est pas reconnue comme la base de test. Rien n''a été fait.'::text, '✖'::text, ''::text; return;
  end if;
  if to_regprocedure('public.library_video_reserve(text,text,text,bigint,text,boolean,uuid)') is null then
    return query select '!'::text, 'Arrêt : uzu-9b (vidéos de la Bibliothèque) n''est pas installé.'::text, '✖'::text, ''::text; return;
  end if;

  begin   -- ======== tout ce bloc est annulé à la fin ========
  insert into auth.users (id, email, raw_user_meta_data)
  select u, 'lv-test-' || v_tag || '-' || s || '@uzu.invalid', jsonb_build_object('name', 'LV test ' || s)
  from (values (A, 'resp'), (I1, 'prof1'), (I2, 'prof2'), (B1, 'eleve'), (D1, 'autreclub'), (X1, 'sansclub')) t(u, s);
  perform pg_temp.lv_j(A, format('select public.create_new_club(%L, %L)', 'LV test ' || v_tag, upper('LVT-' || v_tag)));
  perform pg_temp.lv_j(D1, format('select public.create_new_club(%L, %L)', 'LV test autre ' || v_tag, upper('LVA-' || v_tag)));
  select academy_id into CA from public.academy_members where user_id = A;
  insert into public.profiles (user_id, club_id, role, display_name)
  select u, CA, rl, 'LV test' from (values (I1, 'coach'), (I2, 'coach'), (B1, 'student')) t(u, rl)
  on conflict (user_id) do update set club_id = excluded.club_id, role = excluded.role;
  insert into public.academy_members (academy_id, user_id, role, display_name) values
    (CA, I1, 'instructor', 'LV test prof1'), (CA, I2, 'instructor', 'LV test prof2'), (CA, B1, 'student', 'LV test eleve');
  perform pg_temp.lv_j(A, format('select public.set_member_permissions(%L::uuid, %L::jsonb)',
    (select id from public.academy_members where user_id = I1 and academy_id = CA), '[{"r":"library","a":"approve","s":"academy"}]'));
  v_res := v_res || pg_temp.lv_l('0', 'mise en place fictive : 2 clubs, 6 personnes', CA is not null);

  -- Ajout
  v_res := v_res || pg_temp.lv_l('1', 'élève, professeur sans droit, autre personne sans club : ne peuvent pas ajouter',
    pg_temp.lv_err(B1, format(res, 'technique', 'G17', 'video/mp4', 2000000, 'x', 'true', null)) is not null
    and pg_temp.lv_err(I2, format(res, 'technique', 'G17', 'video/mp4', 2000000, 'x', 'true', null)) is not null
    and pg_temp.lv_err(X1, format(res, 'technique', 'G17', 'video/mp4', 2000000, 'x', 'true', null)) is not null);
  e := pg_temp.lv_err(I1, format(res, 'technique', 'G17', 'video/mp4', 2000000, 'x', 'false', null));
  v_res := v_res || pg_temp.lv_l('2', 'sans déclaration d''accord des personnes filmées : refusé', e ilike '%accord%', coalesce(e, 'accepté à tort'));
  v_res := v_res || pg_temp.lv_l('3', 'plus de 50 Mo, format non vidéo, fiche archivée : refusés',
    pg_temp.lv_err(I1, format(res, 'technique', 'G17', 'video/mp4', 52428801, 'x', 'true', null)) ilike '%50 Mo%'
    and pg_temp.lv_err(I1, format(res, 'technique', 'G17', 'image/png', 1000, 'x', 'true', null)) ilike '%Format%'
    and pg_temp.lv_err(I1, format(res, 'technique', 'G31', 'video/mp4', 1000, 'x', 'true', null)) is not null);
  v1 := pg_temp.lv_j(I1, format(res, 'technique', 'G17', 'video/mp4', 2000000, 'Démonstration', 'true', null));
  v_res := v_res || pg_temp.lv_l('4', 'professeur autorisé : emplacement réservé dans le stockage pédagogique, sous-dossier Bibliothèque',
    v1->>'bucket' = 'videos' and v1->>'path' = CA::text || '/lib/' || (v1->>'id') || '.mp4', v1::text);

  -- Envoi dans le stockage
  e := pg_temp.lv_err(B1, format('insert into storage.objects (bucket_id, name, metadata) values (''videos'', %L, ''{"size":2000000,"mimetype":"video/mp4"}'')', v1->>'path'));
  v_res := v_res || pg_temp.lv_l('5', 'stockage : envoi refusé à l''élève, même à l''emplacement réservé', e is not null, 'accepté à tort');
  v_res := v_res || pg_temp.lv_l('6', 'stockage : la règle Bibliothèque refuse tout emplacement non réservé (dont les vidéos existantes)',
    not (pg_temp.lv_j(I1, format('select to_jsonb(public.uzu_lib_video_upload_ok(%L))', CA::text || '/lib/autre.mp4')))::boolean
    and not (pg_temp.lv_j(I1, format('select to_jsonb(public.uzu_lib_video_upload_ok(%L))', CA::text || '/club-semaine.mp4')))::boolean
    and not (pg_temp.lv_j(I2, format('select to_jsonb(public.uzu_lib_video_upload_ok(%L))', v1->>'path')))::boolean);
  e := pg_temp.lv_err(I1, format('insert into storage.objects (bucket_id, name, metadata) values (''videos'', %L, ''{"size":2000000,"mimetype":"video/mp4"}''), (''videos'', %L, ''{"size":30000,"mimetype":"image/jpeg"}'')', v1->>'path', v1->>'poster_path'));
  v_res := v_res || pg_temp.lv_l('7', 'stockage : envoi accepté à l''auteur, à l''emplacement réservé (vidéo et miniature)', e is null, e);
  j := pg_temp.lv_j(I1, format('select public.library_video_confirm(%L::uuid, 12.3, 1280, 720)', v1->>'id'));
  v_res := v_res || pg_temp.lv_l('8', 'confirmation : fichier vérifié par le serveur, vidéo en ligne avec sa miniature',
    (j->>'ok')::boolean and exists (select 1 from public.club_lib_videos where id = (v1->>'id')::uuid and status = 'ready' and poster_path is not null), j::text);
  v2 := pg_temp.lv_j(I1, format(res, 'technique', 'G17', 'video/mp4', 3000000, '', 'true', null));
  perform pg_temp.lv_err(I1, format('insert into storage.objects (bucket_id, name, metadata) values (''videos'', %L, ''{"size":2999999,"mimetype":"video/mp4"}'')', v2->>'path'));
  j := pg_temp.lv_j(I1, format('select public.library_video_confirm(%L::uuid, 1, 1, 1)', v2->>'id'));
  v_res := v_res || pg_temp.lv_l('9', 'fichier différent de l''annonce : refusé, signalé pour effacement', (j->>'ok')::boolean is false and j->'cleanup' ? (v2->>'path'), j::text);
  v3 := pg_temp.lv_j(I1, format(res, 'technique', 'G17', 'video/mp4', 2000000, 'Vue de dos', 'true', null));
  perform pg_temp.lv_err(I1, format('insert into storage.objects (bucket_id, name, metadata) values (''videos'', %L, ''{"size":2000000,"mimetype":"video/mp4"}'')', v3->>'path'));
  perform pg_temp.lv_j(I1, format('select public.library_video_confirm(%L::uuid, 5, 640, 360)', v3->>'id'));

  -- Lecture
  n := (pg_temp.lv_j(B1, 'select to_jsonb(count(*)) from public.club_lib_videos where technique_id = ''G17'''))::int;
  v_res := v_res || pg_temp.lv_l('10', 'élève du club : voit les 2 vidéos en ligne de la fiche (pas l''envoi refusé)', n = 2, n::text);
  v_res := v_res || pg_temp.lv_l('11', 'autre club et personne sans club : ne voient rien',
    (pg_temp.lv_j(D1, 'select to_jsonb(count(*)) from public.club_lib_videos'))::int = 0 and (pg_temp.lv_j(X1, 'select to_jsonb(count(*)) from public.club_lib_videos'))::int = 0);
  v_res := v_res || pg_temp.lv_l('12', 'fichier lisible par l''élève du club (règle existante), pas par l''autre club',
    (pg_temp.lv_j(B1, format('select to_jsonb(count(*)) from storage.objects where bucket_id = ''videos'' and name = %L', v1->>'path')))::int = 1
    and (pg_temp.lv_j(D1, format('select to_jsonb(count(*)) from storage.objects where bucket_id = ''videos'' and name = %L', v1->>'path')))::int = 0);
  v_res := v_res || pg_temp.lv_l('13', 'aucune écriture directe dans la table des vidéos', pg_temp.lv_err(A, 'insert into public.club_lib_videos (academy_id) values (null)') is not null);

  -- Titre, ordre, fiche modifiée
  perform pg_temp.lv_j(I1, format('select to_jsonb(public.library_video_update(%L::uuid, null, -1))', v3->>'id'));
  v_res := v_res || pg_temp.lv_l('14', 'ordre : « Vue de dos » remontée en premier ; titre et ordre refusés à l''élève',
    (select title from public.club_lib_videos where technique_id = 'G17' and status = 'ready' and academy_id = CA order by position limit 1) = 'Vue de dos'
    and pg_temp.lv_err(B1, format('select public.library_video_update(%L::uuid, ''x'', 0)', v3->>'id')) is not null);
  perform pg_temp.lv_j(I1, 'select to_jsonb(public.library_set_details(''G17'', ''1. Saisir les genoux'', '''', 2))');
  v_res := v_res || pg_temp.lv_l('15', 'repères de la fiche modifiés : vidéos conservées',
    (pg_temp.lv_j(B1, 'select to_jsonb(count(*)) from public.club_lib_videos where technique_id = ''G17'''))::int = 2);

  -- Remplacement
  vb := pg_temp.lv_j(I1, format(res, 'technique', 'G17', 'video/mp4', 2000000, '', 'true', v1->>'id'));
  perform pg_temp.lv_err(I1, format('insert into storage.objects (bucket_id, name, metadata) values (''videos'', %L, ''{"size":2000000,"mimetype":"video/mp4"}'')', vb->>'path'));
  j := pg_temp.lv_j(I1, format('select public.library_video_confirm(%L::uuid, 7, 640, 360)', vb->>'id'));
  v_res := v_res || pg_temp.lv_l('16', 'remplacement : la nouvelle garde la place et le titre, l''ancienne est retirée et signalée pour effacement',
    (j->>'ok')::boolean and j->'cleanup' ? (v1->>'path')
    and (select title from public.club_lib_videos where id = (vb->>'id')::uuid) = 'Démonstration'
    and (select status from public.club_lib_videos where id = (v1->>'id')::uuid) = 'removed', j::text);

  -- Suppression
  v_res := v_res || pg_temp.lv_l('17', 'suppression refusée à l''élève, au professeur sans droit et à l''autre club',
    pg_temp.lv_err(B1, format('select public.library_video_remove(%L::uuid)', v3->>'id')) is not null
    and pg_temp.lv_err(I2, format('select public.library_video_remove(%L::uuid)', v3->>'id')) is not null
    and pg_temp.lv_err(D1, format('select public.library_video_remove(%L::uuid)', v3->>'id')) is not null);
  j := pg_temp.lv_j(I1, format('select public.library_video_remove(%L::uuid)', v3->>'id'));
  v_res := v_res || pg_temp.lv_l('18', 'suppression par le professeur autorisé : retirée aussitôt, fichiers signalés pour effacement',
    (j->>'ok')::boolean and j->'cleanup' ? (v3->>'path') and (pg_temp.lv_j(B1, 'select to_jsonb(count(*)) from public.club_lib_videos where technique_id = ''G17'''))::int = 1, j::text);
  v_res := v_res || pg_temp.lv_l('19', 'effacement du fichier retiré : permis au professeur autorisé seulement ; jamais un fichier en ligne ni une vidéo existante',
    (pg_temp.lv_j(I1, format('select to_jsonb(public.uzu_lib_video_delete_ok(%L))', v3->>'path')))::boolean
    and not (pg_temp.lv_j(B1, format('select to_jsonb(public.uzu_lib_video_delete_ok(%L))', v3->>'path')))::boolean
    and not (pg_temp.lv_j(I1, format('select to_jsonb(public.uzu_lib_video_delete_ok(%L))', vb->>'path')))::boolean
    and not (pg_temp.lv_j(A, format('select to_jsonb(public.uzu_lib_video_delete_ok(%L))', CA::text || '/club-semaine.mp4')))::boolean);

  -- Enchaînement
  j := pg_temp.lv_j(I1, format(res, 'flow', 'FC1', 'video/mp4', 2000000, 'Séquence complète', 'true', null));
  perform pg_temp.lv_err(I1, format('insert into storage.objects (bucket_id, name, metadata) values (''videos'', %L, ''{"size":2000000,"mimetype":"video/mp4"}'')', j->>'path'));
  perform pg_temp.lv_j(I1, format('select public.library_video_confirm(%L::uuid, 30, 1280, 720)', j->>'id'));
  v_res := v_res || pg_temp.lv_l('20', 'enchaînement : vidéo en ligne pour l''élève', (pg_temp.lv_j(B1, 'select to_jsonb(count(*)) from public.club_lib_videos where flow_id = ''FC1'''))::int = 1);
  v_res := v_res || pg_temp.lv_l('21', 'rien dans Class Media : aucun fichier de test hors du stockage pédagogique',
    not exists (select 1 from storage.objects where bucket_id = 'class-media' and name like CA::text || '%'));

  raise exception using message = 'lv_annulation';
  exception when others then
    if sqlerrm <> 'lv_annulation' then v_res := v_res || pg_temp.lv_l('!', 'ERREUR INATTENDUE : contrôle interrompu (tout a été annulé)', false, sqlerrm); end if;
  end;     -- ======== ici, tout ce qui précède est annulé ========

  select count(*) into n from auth.users where email like 'lv-test-' || v_tag || '-%';
  v_res := v_res || pg_temp.lv_l('Fin', 'annulation : aucune personne, vidéo ni fichier de test ne reste',
    n = 0 and not exists (select 1 from storage.objects where bucket_id = 'videos' and name like '%/lib/%' and created_at > now() - interval '5 minutes'), n::text);
  v_res := v_res || pg_temp.lv_l('Fin2', 'vidéos pédagogiques existantes, références et règles existantes identiques avant et après', pg_temp.lv_snap() = v_before);
  return query
    select x->>'n', x->>'test', case when (x->>'ok')::boolean then '✔' else '✖' end, x->>'detail'
    from jsonb_array_elements(v_res) with ordinality t(x, i) order by i;
end $f$;

select * from pg_temp.lv_controle();
