-- =====================================================================================
-- UZU — Journal des cours, lot J4 : Focus des groupes
-- Prérequis : uzu-10-journal.sql (table group_focus et fonction set_group_focus).
-- Ne supprime aucune table, aucun champ, aucune règle d'accès ; aucune donnée modifiée. Rejouable.
--
-- 1. Qui peut publier le focus d'un groupe (vérifié par le serveur) :
--      droit « Contenus · publier » de portée académie → tous les groupes ;
--      portée « ses contenus » → sa section (responsable de section) et les groupes des cours
--      qu'il encadre (professeur). Avant ce script, tout droit « publier » suffisait pour tout groupe.
-- 2. Lecture pour l'équipe : focus en cours, historique, séances publiées depuis, droit par groupe.
-- =====================================================================================
begin;

create or replace function public.uzu_can_group_focus(p_academy uuid, p_section uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_scope text; v_m public.academy_members;
begin
  v_scope := public.uzu_perm_scope(p_academy, 'contents', 'create');
  if v_scope is null or p_section is null then return false; end if;
  if v_scope = 'academy' then return true; end if;
  v_m := public.uzu_staff_member(p_academy);
  if v_m.id is null then return false; end if;
  if v_m.section_id = p_section then return true; end if;
  return exists (select 1 from public.course_meta cm
                  where cm.academy_id = p_academy and cm.section_id = p_section
                    and cm.course_key = any (public.uzu_scope_courses(p_academy, 'assigned_courses')));
end $$;

-- Même signature qu'avant : publier (p_focus rempli) ou dépublier (p_focus null) ; l'historique reste
create or replace function public.set_group_focus(p_section uuid, p_focus jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_theme text; v_from text; v_to text;
begin
  if v_a is null then raise exception 'Aucune académie active'; end if;
  if not exists (select 1 from public.academy_sections where id = p_section and academy_id = v_a) then raise exception 'Groupe inconnu'; end if;
  if not public.uzu_can_group_focus(v_a, p_section) then raise exception 'Droit requis : publier le focus de ce groupe'; end if;
  if p_focus is not null then
    v_theme := btrim(coalesce(p_focus->>'theme', ''));
    v_from := coalesce(p_focus->>'from', ''); v_to := coalesce(p_focus->>'to', '');
    if length(v_theme) not between 1 and 100 or length(coalesce(p_focus->>'details', '')) > 300 then raise exception 'Focus invalide : thème de 1 à 100 caractères, description de 300 au plus'; end if;
    if v_from not in ('', 'fond', 'lutte', 'controle', 'jambes') or v_to not in ('', 'fond', 'lutte', 'controle', 'jambes') then raise exception 'Système inconnu'; end if;
  end if;
  update public.group_focus set unpublished_at = now() where section_id = p_section and unpublished_at is null;
  if p_focus is null then
    perform public.uzu_audit(v_a, 'focus.group_unpublished', 'section', p_section::text, '{}'::jsonb); return false;
  end if;
  insert into public.group_focus (academy_id, section_id, theme, focus_from, focus_to, details, published_by)
  values (v_a, p_section, v_theme, v_from, v_to, btrim(coalesce(p_focus->>'details', '')), v_uid);
  perform public.uzu_audit(v_a, 'focus.group_published', 'section', p_section::text, jsonb_build_object('theme', v_theme));
  return true;
end $$;

create or replace function public.group_focus_board() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy();
begin
  if v_a is null or (public.uzu_staff_member(v_a)).id is null then raise exception 'Réservé à l''équipe du club'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.name,
      'can_publish', public.uzu_can_group_focus(v_a, g.id),
      'current', (select jsonb_build_object('id', f.id, 'theme', f.theme, 'from', f.focus_from, 'to', f.focus_to, 'details', f.details, 'published_at', f.published_at,
                    'by', coalesce((select nullif(m.display_name, '') from public.academy_members m where m.academy_id = v_a and m.user_id = f.published_by), 'Équipe'),
                    'sessions', (select count(*) from public.class_sessions c where c.section_id = g.id and c.status = 'publie' and c.published_at >= f.published_at)::int)
                  from public.group_focus f where f.section_id = g.id and f.unpublished_at is null order by f.published_at desc limit 1),
      'history', coalesce((select jsonb_agg(jsonb_build_object('theme', h.theme, 'from', h.published_at, 'to', h.unpublished_at) order by h.published_at desc)
                  from (select * from public.group_focus f where f.section_id = g.id and f.unpublished_at is not null order by f.published_at desc limit 10) h), '[]'::jsonb),
      'history_count', (select count(*) from public.group_focus f where f.section_id = g.id and f.unpublished_at is not null)::int
    ) order by g.name) from public.academy_sections g where g.academy_id = v_a), '[]'::jsonb);
end $$;

revoke all on function public.uzu_can_group_focus(uuid, uuid) from public, anon;
revoke all on function public.set_group_focus(uuid, jsonb) from public, anon;
revoke all on function public.group_focus_board() from public, anon;
grant execute on function public.uzu_can_group_focus(uuid, uuid) to authenticated;
grant execute on function public.set_group_focus(uuid, jsonb) to authenticated;
grant execute on function public.group_focus_board() to authenticated;

commit;

-- Contrôle : doit afficher true, true et false (pas d'accès anonyme)
select exists (select 1 from pg_proc where proname = 'group_focus_board') as tableau_focus,
       exists (select 1 from pg_proc where proname = 'uzu_can_group_focus') as droit_par_groupe,
       has_function_privilege('anon', 'public.group_focus_board()', 'execute') as acces_anonyme;
