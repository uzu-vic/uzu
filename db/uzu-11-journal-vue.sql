-- =====================================================================================
-- UZU — Journal des cours, lot J3 : vue d'ensemble du responsable
-- Prérequis : uzu-9-bibliotheque.sql puis uzu-10-journal.sql.
-- Ajoute UNE fonction de lecture. Aucune table, aucun champ, aucune règle d'accès modifiés
-- ou supprimés ; aucune donnée écrite. Rejouable.
--
-- Tous les chiffres viennent des séances réellement saisies (class_sessions), des fiches de la
-- Bibliothèque et des appels enregistrés. Aucun chiffre par élève, aucune maîtrise.
-- Accès : responsable (toute l'académie) ou droit « Journal des cours · consulter » de portée
-- académie (toute l'académie) ou section (sa section seulement). Académie lue côté serveur.
-- =====================================================================================
begin;

create or replace function public.journal_overview(p_from date, p_to date, p_section uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy();
  v_scope text; v_sec uuid; v_from date; v_to date; v_discs text[];
begin
  if v_a is null then raise exception 'Aucune académie active'; end if;
  v_scope := public.uzu_perm_scope(v_a, 'class_journal', 'view');
  if v_scope is null or v_scope not in ('academy', 'section') then
    raise exception 'Droit requis : vue d''ensemble du Journal (portée académie ou section)'; end if;
  if v_scope = 'section' then
    v_sec := (public.uzu_staff_member(v_a)).section_id;
    if v_sec is null then raise exception 'Aucune section rattachée à ton compte'; end if;
    if p_section is not null and p_section <> v_sec then raise exception 'Section hors de ta portée'; end if;
  else
    v_sec := p_section;
    if v_sec is not null and not exists (select 1 from public.academy_sections where id = v_sec and academy_id = v_a) then
      raise exception 'Groupe inconnu'; end if;
  end if;
  v_to := least(coalesce(p_to, current_date), current_date + 1);
  v_from := coalesce(p_from, v_to - 30);
  if v_from > v_to then raise exception 'Période invalide'; end if;
  if v_to - v_from > 400 then v_from := v_to - 400; end if;
  v_discs := public.uzu_lib_disciplines(v_a);

  return (
  with g as (
    select s.id, s.name, s.discipline from public.academy_sections s
     where s.academy_id = v_a and (v_sec is null or s.id = v_sec)),
  ss as (
    select c.* from public.class_sessions c
     where c.academy_id = v_a and c.session_date between v_from and v_to
       and (v_sec is null or c.section_id = v_sec)),
  pub as (select * from ss where status = 'publie'),
  cited as (
    select t.technique_id, count(distinct t.session_id)::int n
      from public.class_session_techniques t join pub on pub.id = t.session_id
     where t.technique_id is not null group by t.technique_id),
  -- Appels enregistrés : élèves actifs de l'académie, cours du planning actuel, pointés par l'équipe de l'académie
  -- (les appels de l'ancienne application, sans auteur, sont comptés aussi)
  calls as (
    select distinct e->>'k' k, (e->>'date')::date d, split_part(e->>'k', '|', 2) course, e->>'title' title
      from public.academy_members m
      join public.docs dd on dd.path = 'roll/' || m.user_id::text
      cross join lateral jsonb_array_elements(case when jsonb_typeof(dd.data->'s') = 'array' then dd.data->'s' else '[]'::jsonb end) e
     where m.academy_id = v_a and m.role = 'student' and m.status = 'active'
       and coalesce(e->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$' and (e->>'date')::date between v_from and v_to
       and split_part(coalesce(e->>'k', ''), '|', 2) not in ('', 'libre')
       and exists (select 1 from public.clubs cb, jsonb_array_elements(cb.schedule) x where cb.id = v_a and x->>'id' = split_part(e->>'k', '|', 2))
       and (e->>'by' is null or exists (select 1 from public.academy_members st where st.academy_id = v_a and st.role <> 'student'
                    and st.user_id::text = e->>'by'))),
  missing as (
    select cl.d, cl.course, cl.title, cm.section_id, sec.name group_name
      from calls cl
      left join public.course_meta cm on cm.academy_id = v_a and cm.course_key = cl.course
      left join public.academy_sections sec on sec.id = cm.section_id
     where (v_sec is null or cm.section_id = v_sec)
       and not exists (select 1 from public.class_sessions c where c.academy_id = v_a and c.course_key = cl.course and c.session_date = cl.d))
  select jsonb_build_object(
    'scope', v_scope, 'section', v_sec, 'from', v_from, 'to', v_to,
    'totals', jsonb_build_object(
      'published', (select count(*) from pub)::int,
      'drafts', (select count(*) from public.class_sessions c where c.academy_id = v_a and c.status = 'brouillon' and (v_sec is null or c.section_id = v_sec))::int,
      'calls', (select count(*) from calls cl left join public.course_meta cm on cm.academy_id = v_a and cm.course_key = cl.course where v_sec is null or cm.section_id = v_sec)::int,
      'missing', (select count(*) from missing)::int,
      'techniques', (select count(*) from cited)::int,
      'free_texts', (select count(*) from public.class_session_techniques t join pub on pub.id = t.session_id where t.free_text is not null)::int),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'discipline', g.discipline,
        'published', (select count(*) from pub where pub.section_id = g.id)::int,
        'last', (select max(c.session_date) from public.class_sessions c where c.section_id = g.id and c.status = 'publie'),
        'days', current_date - (select max(c.session_date) from public.class_sessions c where c.section_id = g.id and c.status = 'publie'),
        'coverage', case when g.discipline = any (v_discs) then jsonb_build_object(
            'total', (select count(*) from public.lib_techniques lt where lt.discipline_id = g.discipline and not lt.archived
                        and not exists (select 1 from public.club_lib_hidden h where h.academy_id = v_a and h.technique_id = lt.id))::int,
            'covered', (select count(distinct t.technique_id) from public.class_session_techniques t join public.class_sessions c on c.id = t.session_id
                          join public.lib_techniques lt on lt.id = t.technique_id
                         where c.section_id = g.id and c.status = 'publie' and lt.discipline_id = g.discipline and not lt.archived)::int,
            'never', coalesce((select jsonb_agg(jsonb_build_object('id', lt.id, 'name', lt.name) order by lt.position) from (
                select lt.* from public.lib_techniques lt
                 where lt.discipline_id = g.discipline and not lt.archived
                   and not exists (select 1 from public.club_lib_hidden h where h.academy_id = v_a and h.technique_id = lt.id)
                   and not exists (select 1 from public.class_session_techniques t join public.class_sessions c on c.id = t.session_id
                                    where t.technique_id = lt.id and c.section_id = g.id and c.status = 'publie')
                 order by lt.position limit 12) lt), '[]'::jsonb))
          else null end) order by g.name) from g), '[]'::jsonb),
    'drafts', coalesce((select jsonb_agg(x order by x->>'date' desc) from (
        select jsonb_build_object('id', c.id, 'date', c.session_date, 'group', c.group_name, 'theme', c.theme,
               'author', coalesce((select nullif(m.display_name, '') from public.academy_members m where m.academy_id = v_a and m.user_id = c.author_id), 'Équipe')) x
          from public.class_sessions c where c.academy_id = v_a and c.status = 'brouillon' and (v_sec is null or c.section_id = v_sec)
         order by c.session_date desc limit 20) q), '[]'::jsonb),
    'missing', coalesce((select jsonb_agg(jsonb_build_object('date', mi.d, 'course', mi.course, 'title', mi.title, 'group', mi.group_name) order by mi.d desc)
        from (select * from missing order by d desc limit 30) mi), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(jsonb_build_object('id', ci.technique_id, 'name', lt.name, 'n', ci.n) order by ci.n desc, lt.position)
        from (select * from cited order by n desc limit 10) ci join public.lib_techniques lt on lt.id = ci.technique_id), '[]'::jsonb),
    'authors', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'n', a.n) order by a.n desc, a.name)
        from (select coalesce((select nullif(m.display_name, '') from public.academy_members m where m.academy_id = v_a and m.user_id = pub.author_id), 'Équipe') name, count(*)::int n
                from pub group by pub.author_id) a), '[]'::jsonb))
  );
end $$;

revoke all on function public.journal_overview(date, date, uuid) from public, anon;
grant execute on function public.journal_overview(date, date, uuid) to authenticated;

commit;

-- Contrôle : doit afficher true (fonction présente) et false (pas d'accès anonyme)
select exists (select 1 from pg_proc where proname = 'journal_overview') as vue_ensemble,
       has_function_privilege('anon', 'public.journal_overview(date, date, uuid)', 'execute') as acces_anonyme;
