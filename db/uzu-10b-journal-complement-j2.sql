-- =====================================================================================
-- UZU — Journal des cours : COMPLÉMENT du lot J2 (base de test uniquement)
-- Pourquoi : la base de test a reçu uzu-10 dans sa version du lot J1. Le lot J2 a ajouté ou modifié
-- quatre fonctions, absentes de la base de test :
--   - journal_groups     : renvoie aussi les cours rattachés et les droits par groupe ;
--   - set_member_groups  : interdit de modifier ses propres groupes ;
--   - student_groups     : groupes d'un élève (fiche élève) ;
--   - set_student_groups : réglage des groupes depuis la fiche élève (élèves seulement).
-- Ce fichier ne contient QUE ces quatre fonctions, identiques à uzu-10 actuel. Aucune table, aucune donnée,
-- aucune autre fonction n'est touchée (ni uzu_perm_catalog ni journal_feed, modifiés depuis par uzu-13).
-- Rejouable.
-- =====================================================================================
begin;

-- Groupes visibles : adhérent = ses groupes ; équipe = tous les groupes du club
create or replace function public.journal_groups() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_staff boolean;
begin
  if v_a is null then return '[]'::jsonb; end if;
  v_staff := (public.uzu_staff_member(v_a)).id is not null;
  return coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'discipline', g.discipline,
      'mine', g.id = any (public.uzu_my_groups(v_a)),
      'primary', exists (select 1 from public.academy_members m where m.academy_id = v_a and m.user_id = v_uid and m.status = 'active' and m.section_id = g.id),
      'courses', coalesce((select jsonb_agg(cm.course_key order by cm.course_key) from public.course_meta cm where cm.academy_id = v_a and cm.section_id = g.id), '[]'::jsonb),
      'can_create', v_staff and public.uzu_can_journal(v_a, 'create', g.id, null),
      'can_view', v_staff and public.uzu_can_journal(v_a, 'view', g.id, null),
      'focus', (select jsonb_build_object('theme', f.theme, 'from', f.focus_from, 'to', f.focus_to, 'details', f.details, 'published_at', f.published_at)
                  from public.group_focus f where f.section_id = g.id and f.unpublished_at is null order by f.published_at desc limit 1)) order by g.name)
    from public.academy_sections g
   where g.academy_id = v_a and (v_staff or g.id = any (public.uzu_my_groups(v_a)))), '[]'::jsonb);
end $$;

-- Groupes secondaires d'un membre (le groupe principal se règle comme aujourd'hui)
create or replace function public.set_member_groups(p_member uuid, p_sections uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_m public.academy_members; v_n int;
begin
  if v_a is null or not public.uzu_can(v_a, 'students', 'create') then raise exception 'Droit requis : gérer les élèves'; end if;
  select * into v_m from public.academy_members where id = p_member and academy_id = v_a and status = 'active';
  if v_m.id is null then raise exception 'Membre introuvable'; end if;
  if v_m.user_id = v_uid then raise exception 'Tu ne peux pas modifier tes propres groupes'; end if;
  if cardinality(coalesce(p_sections, '{}'::uuid[])) > 20 then raise exception 'Trop de groupes'; end if;
  if exists (select 1 from unnest(coalesce(p_sections, '{}'::uuid[])) x where not exists (select 1 from public.academy_sections s where s.id = x and s.academy_id = v_a)) then
    raise exception 'Groupe inconnu'; end if;
  delete from public.academy_group_members where member_id = p_member and not (section_id = any (coalesce(p_sections, '{}'::uuid[])));
  insert into public.academy_group_members (academy_id, section_id, member_id, added_by)
  select v_a, x, p_member, v_uid from unnest(coalesce(p_sections, '{}'::uuid[])) x
   where x is distinct from v_m.section_id
  on conflict do nothing;
  select count(*) into v_n from public.academy_group_members where member_id = p_member;
  perform public.uzu_audit(v_a, 'member.groups', 'member', p_member::text, jsonb_build_object('groups', v_n));
  return v_n;
end $$;

-- Groupes d'un élève, par son compte (fiche élève) : groupe principal + groupes secondaires
create or replace function public.student_groups(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_m public.academy_members;
begin
  if v_a is null or not public.uzu_can(v_a, 'students', 'view') then raise exception 'Droit requis : voir les élèves'; end if;
  select * into v_m from public.academy_members where academy_id = v_a and user_id = p_user and status = 'active';
  if v_m.id is null then raise exception 'Membre introuvable'; end if;
  return jsonb_build_object('member', v_m.id, 'student', v_m.role = 'student', 'primary', v_m.section_id,
    'secondary', coalesce((select jsonb_agg(gm.section_id order by gm.created_at) from public.academy_group_members gm where gm.member_id = v_m.id), '[]'::jsonb),
    'can_edit', v_m.role = 'student' and p_user <> v_uid and public.uzu_can(v_a, 'students', 'create'));
end $$;

-- Réglage par la fiche élève. Réservé aux élèves : le groupe d'un membre de l'équipe règle ses droits
-- (portée « section ») et se change seulement dans Équipe. Personne ne modifie ses propres groupes ici.
create or replace function public.set_student_groups(p_user uuid, p_primary uuid, p_secondary uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_m public.academy_members; v_n int;
begin
  if v_a is null or not public.uzu_can(v_a, 'students', 'create') then raise exception 'Droit requis : gérer les élèves'; end if;
  if p_user = v_uid then raise exception 'Tu ne peux pas modifier tes propres groupes'; end if;
  select * into v_m from public.academy_members where academy_id = v_a and user_id = p_user and status = 'active';
  if v_m.id is null then raise exception 'Membre introuvable'; end if;
  if v_m.role <> 'student' then raise exception 'Le groupe d''un membre de l''équipe se règle dans Équipe'; end if;
  if p_primary is not null and not exists (select 1 from public.academy_sections s where s.id = p_primary and s.academy_id = v_a) then
    raise exception 'Groupe inconnu'; end if;
  update public.academy_members set section_id = p_primary where id = v_m.id and section_id is distinct from p_primary;
  v_n := public.set_member_groups(v_m.id, array(select x from unnest(coalesce(p_secondary, '{}'::uuid[])) x where x is distinct from p_primary));
  return v_n;
end $$;

revoke all on function public.journal_groups() from public, anon;
revoke all on function public.set_member_groups(uuid, uuid[]) from public, anon;
revoke all on function public.student_groups(uuid) from public, anon;
revoke all on function public.set_student_groups(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.journal_groups() to authenticated;
grant execute on function public.set_member_groups(uuid, uuid[]) to authenticated;
grant execute on function public.student_groups(uuid) to authenticated;
grant execute on function public.set_student_groups(uuid, uuid, uuid[]) to authenticated;

commit;

-- Contrôle : true, true, false
select
  to_regprocedure('public.student_groups(uuid)') is not null as fiche_eleve,
  to_regprocedure('public.set_student_groups(uuid,uuid,uuid[])') is not null as reglage_groupes,
  has_function_privilege('anon', 'public.set_student_groups(uuid,uuid,uuid[])', 'execute') as ouvert_aux_visiteurs;

-- RETOUR ARRIÈRE — ne pas exécuter sauf décision :
-- drop function if exists public.set_student_groups(uuid, uuid, uuid[]); drop function if exists public.student_groups(uuid);
-- puis relancer journal_groups et set_member_groups depuis la version J1 de uzu-10 (commit 95756ba).
