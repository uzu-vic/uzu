-- =====================================================================================
-- UZU — « Où rouler ? » étape 2 : VÉRIFICATION SUR LES COMPTES RÉELS de la base de TEST, sans rien modifier
-- Pour chaque compte existant : ce que le module lui montre (aucun profil, recherche fermée tant qu'il n'est pas activé),
-- tables fermées, accès aux signalements réservé au référent désigné. Tout est annulé à la fin.
-- Aucune adresse électronique ni identifiant complet n'est affiché (8 premiers caractères seulement).
-- =====================================================================================
create or replace function pg_temp.vr_as(p_uid uuid) returns void language plpgsql as $$
begin
  if p_uid is null then perform set_config('role', 'none', true); perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claims', '', true);
  else perform set_config('request.jwt.claim.sub', p_uid::text, true); perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true); perform set_config('role', 'authenticated', true); end if;
end $$;
create or replace function pg_temp.vr_j(p_uid uuid, p_sql text) returns jsonb language plpgsql as $$
declare v jsonb; begin perform pg_temp.vr_as(p_uid); execute p_sql into v; perform pg_temp.vr_as(null); return v;
exception when others then perform pg_temp.vr_as(null); return jsonb_build_object('erreur', sqlerrm); end $$;
create or replace function pg_temp.vr_err(p_uid uuid, p_sql text) returns text language plpgsql as $$
begin perform pg_temp.vr_as(p_uid); execute p_sql; perform pg_temp.vr_as(null); return null;
exception when others then perform pg_temp.vr_as(null); return coalesce(nullif(sqlerrm, ''), 'refusé'); end $$;

create or replace function pg_temp.vr_run() returns jsonb language plpgsql as $f$
declare v_url text; out jsonb := '[]'; u record; me jsonb; s jsonb; adm text; is_ref boolean; n_before int; n_after int;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' then return jsonb_build_object('arret', 'pas la base de test'); end if;
  select (select count(*) from public.rouler_profiles) + (select count(*) from public.rouler_availabilities) + (select count(*) from public.rouler_search_log)
       + (select count(*) from public.rouler_reports) + (select count(*) from public.user_blocks) into n_before;
  begin
    for u in select a.id, p.role, (select string_agg(m.role, '+' order by m.role) from public.academy_members m where m.user_id = a.id and m.status = 'active') as roles
               from auth.users a left join public.profiles p on p.user_id = a.id order by a.created_at loop
      me := pg_temp.vr_j(u.id, 'select public.rouler_me()');
      s := pg_temp.vr_j(u.id, 'select public.rouler_search(''91286'', 25)');
      adm := pg_temp.vr_err(u.id, 'select public.rouler_admin_reports()');
      is_ref := exists (select 1 from public.dir_moderators where user_id = u.id and active);
      out := out || jsonb_build_array(jsonb_build_object(
        'compte', left(u.id::text, 8), 'profil', coalesce(u.role, '?'), 'roles_club', coalesce(u.roles, 'aucun'), 'referent', is_ref,
        'me_ok', not (me ? 'erreur') and me->'profile' = 'null'::jsonb and (me->>'minor') = 'false',
        'nom_affiche', me->>'name', 'ceinture', me->>'belt', 'clubs', jsonb_array_length(coalesce(me->'clubs', '[]')),
        'recherche', coalesce(s->>'need', s->>'erreur', 'résultats'),
        'tables_fermees', pg_temp.vr_err(u.id, 'select count(*) from public.rouler_availabilities') is not null and pg_temp.vr_err(u.id, 'select count(*) from public.rouler_profiles') is not null,
        'outils_internes_fermes', pg_temp.vr_err(u.id, format('select public.rouler_name(%L::uuid)', u.id)) is not null and pg_temp.vr_err(u.id, 'select public.rouler_expire()') is not null,
        'signalements', case when adm is null then 'accès' else 'refusé' end,
        'droits_conformes', (adm is null) = is_ref));
    end loop;
    raise exception using message = 'vr_annulation';
  exception when others then if sqlerrm <> 'vr_annulation' then out := out || jsonb_build_array(jsonb_build_object('erreur', sqlerrm)); end if;
  end;
  select (select count(*) from public.rouler_profiles) + (select count(*) from public.rouler_availabilities) + (select count(*) from public.rouler_search_log)
       + (select count(*) from public.rouler_reports) + (select count(*) from public.user_blocks) into n_after;
  return jsonb_build_object('comptes', out, 'rien_modifie', n_before = n_after, 'lignes_module_et_blocages', n_after);
end $f$;

select pg_temp.vr_run() as verification;
