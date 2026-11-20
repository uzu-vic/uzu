-- =========================================================================================
-- UZU — « Où rouler ? » : VÉRIFICATION RÉELLE DES DROITS, COMPTE PAR COMPTE — BASE DE TEST
-- À lancer APRÈS la désignation d'un référent (designer-referent.sql), sur la base de TEST seulement.
-- Pour CHAQUE compte réel de la base de test, se met à sa place (sans mot de passe, par son
-- identifiant) et vérifie ce que l'annuaire lui permet. Les actions d'écriture du référent sont
-- faites puis ANNULÉES : rien ne reste, ce que la dernière ligne vérifie.
-- Refuse de tourner hors de la base de test.
-- =========================================================================================
create or replace function pg_temp.vr_as(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then
    perform set_config('role', 'none', true); perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
  end if;
end $$;
create or replace function pg_temp.vr_j(p_uid uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb; begin perform pg_temp.vr_as(p_uid); execute p_sql into v; perform pg_temp.vr_as(null); return v;
exception when others then perform pg_temp.vr_as(null); return jsonb_build_object('erreur', sqlerrm); end $$;
create or replace function pg_temp.vr_ok(p_uid uuid, p_sql text) returns boolean language plpgsql as $$
begin perform pg_temp.vr_as(p_uid); execute p_sql; perform pg_temp.vr_as(null); return true;
exception when others then perform pg_temp.vr_as(null); return false; end $$;
-- Lignes visibles d'une table pour ce compte (null si la table est fermée)
create or replace function pg_temp.vr_n(p_uid uuid, p_table text) returns bigint language plpgsql as $$
declare n bigint; begin perform pg_temp.vr_as(p_uid); execute format('select count(*) from %s', p_table) into n; perform pg_temp.vr_as(null); return n;
exception when others then perform pg_temp.vr_as(null); return null; end $$;
create or replace function pg_temp.vr_snap() returns text language sql as $$
  select md5(coalesce((select string_agg(t::text, '|' order by t::text) from public.clubs t), '')
          || coalesce((select string_agg(t::text, '|' order by t::text) from public.academy_members t), '')
          || coalesce((select string_agg(t::text, '|' order by t::text) from public.profiles t), '')
          || coalesce((select string_agg(t::text, '|' order by t::text) from public.dir_clubs t), '')
          || coalesce((select string_agg(t::text, '|' order by t::text) from public.dir_moderators t), '')
          || (select count(*)::text from public.dir_moderation_log) || (select count(*)::text from public.dir_suggestions))
$$;

create or replace function pg_temp.vr_controle() returns table (compte text, profil text, test text, resultat text, detail text)
language plpgsql as $f$
declare
  v_url text; v_before text := pg_temp.vr_snap(); u record; j jsonb; v_slug text; v_cli text; v_mod boolean; v_tables text[] :=
    array['public.clubs','public.academy_members','public.profiles','public.docs','storage.objects','public.dir_clubs','public.dir_moderators','public.dir_moderation_log'];
  t text; n1 bigint; n2 bigint; v_diff text; v_res jsonb := '[]'; v_can boolean;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' then
    return query select '!'::text, ''::text, 'Arrêt : cette base n''est pas reconnue comme la base de test. Rien n''a été fait.'::text, '✖'::text, ''::text; return;
  end if;
  select slug into v_cli from public.dir_clubs where club_id is not null limit 1;

  for u in
    select au.id, left(au.id::text, 8) as code,
           coalesce((select string_agg(c.name || ' : ' || m.role, ', ') from public.academy_members m join public.clubs c on c.id = m.academy_id where m.user_id = au.id and m.status = 'active'),
                    (select p.role from public.profiles p where p.user_id = au.id), 'sans profil') as profil,
           exists (select 1 from public.dir_moderators d where d.user_id = au.id and d.active and d.revoked_at is null) as est_referent
      from auth.users au order by au.created_at
  loop
    v_mod := u.est_referent;
    -- Ce que tout compte connecté peut faire
    v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'recherche de l''annuaire (Grigny, 25 km)',
      pg_temp.vr_ok(u.id, 'select public.dir_search(''91286'', 25)'), ''));
    j := pg_temp.vr_j(u.id, 'select public.dir_whoami()');
    v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'espace référent affiché : ' || case when v_mod then 'oui' else 'non' end,
      coalesce((j->>'moderator')::boolean, false) = v_mod, j::text));
    v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'outils du référent (liste, propositions, journal) : ' || case when v_mod then 'autorisés' else 'refusés' end,
      pg_temp.vr_ok(u.id, 'select public.dir_admin_list()') = v_mod and pg_temp.vr_ok(u.id, 'select public.dir_admin_suggestions(null)') = v_mod
      and pg_temp.vr_ok(u.id, 'select public.dir_admin_log(10)') = v_mod, ''));
    v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'tables de l''annuaire, des référents et du journal fermées en lecture directe',
      pg_temp.vr_n(u.id, 'public.dir_clubs') is null and pg_temp.vr_n(u.id, 'public.dir_moderators') is null and pg_temp.vr_n(u.id, 'public.dir_moderation_log') is null, ''));
    v_can := coalesce((pg_temp.vr_j(u.id, 'select to_jsonb(public.uzu_can(public.uzu_active_academy(), ''academy_settings'', ''view''))'))::text = 'true', false);
    v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'fiche annuaire de son club : ' || case when v_can then 'accessible (droit « Paramètres de l''académie »)' else 'refusée (pas le droit « Paramètres de l''académie »)' end,
      pg_temp.vr_ok(u.id, 'select public.dir_my_club()') = v_can, ''));

    if v_mod then
      -- Le rôle ne doit rien ouvrir d'autre : lignes visibles identiques avec et sans le rôle
      v_diff := '';
      foreach t in array v_tables loop
        n1 := pg_temp.vr_n(u.id, t);
        update public.dir_moderators set active = false where user_id = u.id;
        n2 := pg_temp.vr_n(u.id, t);
        update public.dir_moderators set active = true where user_id = u.id;
        if n1 is distinct from n2 then v_diff := v_diff || t || ' ' || coalesce(n2::text, 'fermée') || '→' || coalesce(n1::text, 'fermée') || ' '; end if;
      end loop;
      v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'le rôle n''ouvre aucune autre donnée (clubs, adhésions, profils, carnets, fichiers stockés)', v_diff = '', v_diff));
      begin   -- ===== écritures d'essai du référent, annulées =====
        j := pg_temp.vr_j(u.id, 'select public.dir_admin_save(''{"name":"Essai référent","insee":"91228","disciplines":["grappling_nogi"],"status":"draft","sessions":[{"d":6,"s":"10:00","e":"12:00","kind":"open_mat"}]}''::jsonb)');
        v_slug := j->>'slug';
        v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'créer une fiche référencée (brouillon), absente de la recherche',
          v_slug is not null and not exists (select 1 from jsonb_array_elements(pg_temp.vr_j(u.id, 'select public.dir_search(''91228'', 10)')->'clubs') x where x->>'slug' = v_slug), j::text));
        perform pg_temp.vr_j(u.id, format('select public.dir_admin_set_status(%L, ''published'')', v_slug));
        v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'publier la fiche : trouvée par la recherche',
          exists (select 1 from jsonb_array_elements(pg_temp.vr_j(u.id, 'select public.dir_search(''91228'', 10)')->'clubs') x where x->>'slug' = v_slug), ''));
        if v_cli is not null then
          v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'fiche d''un club UZU : modification refusée, masquage sans motif refusé',
            not pg_temp.vr_ok(u.id, format('select public.dir_admin_save(%L::jsonb)', jsonb_build_object('slug', v_cli, 'name', 'Autre', 'insee', '91286')))
            and not pg_temp.vr_ok(u.id, format('select public.dir_admin_set_status(%L, ''moderated'', '''')', v_cli)), ''));
        else
          v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'fiche d''un club UZU : non vérifiable, aucun club n''a encore publié sa fiche', null, ''));
        end if;
        j := pg_temp.vr_j(u.id, 'select public.dir_admin_log(5)');
        v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'journal : actions d''essai tracées, sans adresse électronique',
          jsonb_array_length(j) >= 2 and j::text not like '%@%', left(j::text, 160)));
        raise exception using message = 'vr_annulation';
      exception when others then
        if sqlerrm <> 'vr_annulation' then v_res := v_res || jsonb_build_array(jsonb_build_array(u.code, u.profil, 'ERREUR INATTENDUE (essais annulés)', false, sqlerrm)); end if;
      end;
    end if;
  end loop;

  v_res := v_res || jsonb_build_array(jsonb_build_array('Fin', '', 'aucune donnée modifiée : clubs, adhésions, profils, fiches, référents, journal, propositions identiques', pg_temp.vr_snap() = v_before, ''));
  return query select x->>0, x->>1, x->>2, case when x->>3 is null then '—' when (x->>3)::boolean then '✔' else '✖' end, x->>4
    from jsonb_array_elements(v_res) x;
end $f$;

select * from pg_temp.vr_controle();
