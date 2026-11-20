-- =========================================================================================
-- UZU — The mat doesn't lie · JOURNAL DES COURS (lot J1 : données et droits)
--   • Groupes : la section actuelle d'un membre reste son groupe principal (aucune donnée modifiée) ;
--     on peut lui ajouter des groupes secondaires (décision D5).
--   • Séances collectives par groupe : brouillon, publiée, dépubliée ; techniques choisies dans la
--     Bibliothèque ou en texte libre ; vidéo ou photo avec déclaration d'accord ; historique.
--   • Focus par groupe (chaque publication conservée).
--   • Droits : ressource « class_journal » (consulter, créer, modifier, publier = action « approve »
--     existante, pour ne toucher à aucune contrainte) avec les portées
--     existantes. Les adhérents lisent les séances PUBLIÉES de leurs groupes, présents ou absents,
--     et ne peuvent rien écrire. Le Journal n'écrit jamais dans la progression individuelle.
-- Prérequis : scripts du lot 5 (équipe et permissions), uzu-6 et uzu-9-bibliotheque.sql appliqués.
-- À exécuter dans Supabase > SQL Editor (base de TEST d'abord). Ajout seul, rejouable ;
-- s'annule entièrement en cas d'erreur.
-- =========================================================================================
begin;

-- -----------------------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------------------
create table if not exists public.academy_group_members (
  academy_id  uuid not null references public.clubs (id) on delete cascade,
  section_id  uuid not null references public.academy_sections (id) on delete cascade,
  member_id   uuid not null references public.academy_members (id) on delete cascade,
  added_by    uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (section_id, member_id)
);
create index if not exists academy_group_members_member_idx on public.academy_group_members (member_id);

create table if not exists public.class_sessions (
  id                   uuid primary key default gen_random_uuid(),
  academy_id           uuid not null references public.clubs (id) on delete cascade,
  section_id           uuid references public.academy_sections (id) on delete set null,
  group_name           text not null default '',          -- conservé si le groupe est supprimé
  course_key           text check (course_key is null or course_key ~ '^[A-Za-z0-9_-]{1,40}$'),
  session_date         date not null,
  discipline_id        text references public.lib_disciplines (id),
  theme                text not null check (length(btrim(theme)) between 1 and 120),
  objective            text not null default '' check (length(objective) <= 500),
  exercises            text not null default '' check (length(exercises) <= 2000),
  comment              text not null default '' check (length(comment) <= 2000),
  previous_session_id  uuid references public.class_sessions (id) on delete set null,
  focus_snapshot       jsonb not null default '{}'::jsonb,
  status               text not null default 'brouillon' check (status in ('brouillon','publie','depublie')),
  author_id            uuid references auth.users (id) on delete set null,
  updated_by           uuid references auth.users (id) on delete set null,
  published_at         timestamptz,
  published_by         uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists class_sessions_group_idx on public.class_sessions (academy_id, section_id, session_date desc);
create index if not exists class_sessions_course_idx on public.class_sessions (academy_id, course_key, session_date);

create table if not exists public.class_session_techniques (
  session_id    uuid not null references public.class_sessions (id) on delete cascade,
  position      int  not null,
  technique_id  text references public.lib_techniques (id),
  free_text     text check (free_text is null or length(btrim(free_text)) between 1 and 120),
  primary key (session_id, position),
  check ((technique_id is null) <> (free_text is null))
);
create index if not exists class_session_techniques_tech_idx on public.class_session_techniques (technique_id);

create table if not exists public.class_session_media (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.class_sessions (id) on delete cascade,
  academy_id          uuid not null references public.clubs (id) on delete cascade,
  kind                text not null check (kind in ('photo','video')),
  storage_path        text not null check (length(storage_path) between 1 and 300),
  rights_declared_at  timestamptz not null,
  rights_declared_by  uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now()
);

create table if not exists public.class_session_events (
  id          bigserial primary key,
  academy_id  uuid not null references public.clubs (id) on delete cascade,
  session_id  uuid not null references public.class_sessions (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists class_session_events_idx on public.class_session_events (session_id, created_at);

create table if not exists public.group_focus (
  id              uuid primary key default gen_random_uuid(),
  academy_id      uuid not null references public.clubs (id) on delete cascade,
  section_id      uuid not null references public.academy_sections (id) on delete cascade,
  theme           text not null check (length(btrim(theme)) between 1 and 100),
  focus_from      text not null default '',
  focus_to        text not null default '',
  details         text not null default '' check (length(details) <= 300),
  published_by    uuid references auth.users (id) on delete set null,
  published_at    timestamptz not null default now(),
  unpublished_at  timestamptz
);
create index if not exists group_focus_idx on public.group_focus (section_id, published_at desc);

-- -----------------------------------------------------------------------------------------
-- 2. Droits : une ressource de plus (le reste du catalogue est inchangé)
-- -----------------------------------------------------------------------------------------
create or replace function public.uzu_perm_catalog() returns jsonb
language sql immutable as $$ select '{
  "dashboard":          {"actions":["view"],                               "scopes":["academy"]},
  "students":           {"actions":["view","create","delete"],             "scopes":["academy","section","assigned_courses","authorized_students"]},
  "courses":            {"actions":["view","create","update","delete","manage"], "scopes":["academy","section","assigned_courses"]},
  "sessions":           {"actions":["view","update"],                      "scopes":["academy","section","assigned_courses"]},
  "attendance":         {"actions":["view","create","update","delete"],    "scopes":["academy","section","assigned_courses"]},
  "progression":        {"actions":["view","update"],                      "scopes":["academy","section","assigned_courses","authorized_students"]},
  "belts":              {"actions":["view","create","approve"],            "scopes":["academy","section","assigned_courses","authorized_students"]},
  "pedagogical_notes":  {"actions":["view","create","update","delete"],    "scopes":["academy","section","assigned_courses","authorized_students"]},
  "contents":           {"actions":["view","create","update","delete"],    "scopes":["academy","own_content"]},
  "schedule":           {"actions":["view"],                               "scopes":["academy"]},
  "instructors":        {"actions":["view","create","update","delete"],    "scopes":["academy"]},
  "academy_settings":   {"actions":["view","update"],                      "scopes":["academy"]},
  "academy_statistics": {"actions":["view"],                               "scopes":["academy"]},
  "communications":     {"actions":["view","create","delete"],             "scopes":["academy"]},
  "academy_audit_logs": {"actions":["view"],                               "scopes":["academy"]},
  "library":            {"actions":["approve","manage"],                   "scopes":["academy"]},
  "class_journal":      {"actions":["view","create","update","approve"],   "scopes":["academy","section","assigned_courses"]}
}'::jsonb $$;

-- Modèles par rôle (nouvelles invitations et transfert de responsabilité) : ajout du Journal
create or replace function public.uzu_perm_template(p_role text) returns jsonb
language sql immutable as $$ select case p_role
  when 'instructor' then '[
    {"r":"dashboard","a":"view","s":"academy"},{"r":"schedule","a":"view","s":"academy"},
    {"r":"students","a":"view","s":"academy"},{"r":"courses","a":"view","s":"academy"},
    {"r":"sessions","a":"view","s":"assigned_courses"},{"r":"sessions","a":"update","s":"assigned_courses"},
    {"r":"attendance","a":"view","s":"academy"},{"r":"attendance","a":"create","s":"assigned_courses"},{"r":"attendance","a":"update","s":"assigned_courses"},
    {"r":"progression","a":"view","s":"academy"},{"r":"progression","a":"update","s":"academy"},
    {"r":"belts","a":"view","s":"academy"},{"r":"belts","a":"create","s":"academy"},
    {"r":"pedagogical_notes","a":"view","s":"academy"},{"r":"pedagogical_notes","a":"create","s":"academy"},{"r":"pedagogical_notes","a":"update","s":"academy"},
    {"r":"contents","a":"view","s":"academy"},{"r":"contents","a":"create","s":"own_content"},{"r":"contents","a":"update","s":"own_content"},
    {"r":"communications","a":"view","s":"academy"},
    {"r":"class_journal","a":"view","s":"assigned_courses"},{"r":"class_journal","a":"create","s":"assigned_courses"},{"r":"class_journal","a":"approve","s":"assigned_courses"}]'::jsonb
  when 'assistant' then '[
    {"r":"dashboard","a":"view","s":"academy"},{"r":"schedule","a":"view","s":"academy"},
    {"r":"students","a":"view","s":"assigned_courses"},{"r":"courses","a":"view","s":"assigned_courses"},
    {"r":"sessions","a":"view","s":"assigned_courses"},
    {"r":"attendance","a":"view","s":"assigned_courses"},{"r":"attendance","a":"create","s":"assigned_courses"},{"r":"attendance","a":"update","s":"assigned_courses"},
    {"r":"communications","a":"view","s":"academy"},
    {"r":"class_journal","a":"view","s":"assigned_courses"}]'::jsonb
  when 'section_lead' then '[
    {"r":"dashboard","a":"view","s":"academy"},{"r":"schedule","a":"view","s":"academy"},
    {"r":"students","a":"view","s":"section"},{"r":"courses","a":"view","s":"academy"},
    {"r":"courses","a":"update","s":"section"},{"r":"courses","a":"manage","s":"section"},
    {"r":"sessions","a":"view","s":"section"},{"r":"sessions","a":"update","s":"section"},
    {"r":"attendance","a":"view","s":"section"},{"r":"attendance","a":"create","s":"section"},{"r":"attendance","a":"update","s":"section"},{"r":"attendance","a":"delete","s":"section"},
    {"r":"progression","a":"view","s":"section"},{"r":"progression","a":"update","s":"section"},
    {"r":"belts","a":"view","s":"section"},{"r":"belts","a":"create","s":"section"},{"r":"belts","a":"approve","s":"section"},
    {"r":"pedagogical_notes","a":"view","s":"section"},{"r":"pedagogical_notes","a":"create","s":"section"},{"r":"pedagogical_notes","a":"update","s":"section"},
    {"r":"contents","a":"view","s":"academy"},{"r":"contents","a":"create","s":"own_content"},{"r":"contents","a":"update","s":"own_content"},{"r":"contents","a":"delete","s":"own_content"},
    {"r":"communications","a":"view","s":"academy"},{"r":"academy_statistics","a":"view","s":"academy"},
    {"r":"instructors","a":"view","s":"academy"},
    {"r":"class_journal","a":"view","s":"section"},{"r":"class_journal","a":"create","s":"section"},{"r":"class_journal","a":"update","s":"section"},{"r":"class_journal","a":"approve","s":"section"}]'::jsonb
  else '[]'::jsonb end $$;

-- -----------------------------------------------------------------------------------------
-- 3. Fonctions d'accès
-- -----------------------------------------------------------------------------------------
-- Groupes de l'utilisateur connecté dans une académie : groupe principal + groupes secondaires
create or replace function public.uzu_my_groups(p_academy uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct g), '{}'::uuid[]) from (
    select m.section_id as g from public.academy_members m
     where m.academy_id = p_academy and m.user_id = auth.uid() and m.status = 'active' and m.section_id is not null
    union
    select gm.section_id from public.academy_group_members gm
      join public.academy_members m on m.id = gm.member_id
     where gm.academy_id = p_academy and m.user_id = auth.uid() and m.status = 'active'
  ) x
$$;

-- Droit de l'équipe sur une séance d'un groupe (et d'un cours, s'il est renseigné)
--   toute l'académie → oui ; sa section → groupe = sa section, ou cours de sa section ;
--   ses cours → cours qu'il encadre, ou groupe d'un cours qu'il encadre
create or replace function public.uzu_can_journal(p_academy uuid, p_action text, p_section uuid, p_course text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_scope text; v_m public.academy_members; v_courses text[];
begin
  v_scope := public.uzu_perm_scope(p_academy, 'class_journal', p_action);
  if v_scope is null then return false; end if;
  if v_scope = 'academy' then return true; end if;
  v_m := public.uzu_staff_member(p_academy);
  if v_m.id is null then return false; end if;
  v_courses := public.uzu_scope_courses(p_academy, v_scope);
  if p_course is not null and p_course = any (v_courses) then return true; end if;
  if v_scope = 'section' then return p_section is not null and p_section = v_m.section_id; end if;
  if v_scope = 'assigned_courses' then
    return p_section is not null and exists (select 1 from public.course_meta cm
      where cm.academy_id = p_academy and cm.section_id = p_section and cm.course_key = any (v_courses));
  end if;
  return false;
end $$;

-- Lecture d'une séance : adhérent du groupe (publiée) ; équipe autorisée ; auteur
create or replace function public.uzu_journal_readable(p_session public.class_sessions) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return false; end if;
  if p_session.status = 'publie' and p_session.section_id = any (public.uzu_my_groups(p_session.academy_id)) then return true; end if;
  if (public.uzu_staff_member(p_session.academy_id)).id is null then return false; end if;
  return p_session.author_id = auth.uid()
      or public.uzu_can_journal(p_session.academy_id, 'view', p_session.section_id, p_session.course_key);
end $$;

create or replace function public.uzu_journal_event(p_academy uuid, p_session uuid, p_action text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.class_session_events (academy_id, session_id, actor_id, action, details)
  values (p_academy, p_session, auth.uid(), p_action, coalesce(p_details, '{}'::jsonb))
$$;

-- -----------------------------------------------------------------------------------------
-- 4. Règles d'accès (lecture seule depuis l'application ; écritures par fonctions serveur)
-- -----------------------------------------------------------------------------------------
alter table public.academy_group_members    enable row level security;
alter table public.class_sessions           enable row level security;
alter table public.class_session_techniques enable row level security;
alter table public.class_session_media      enable row level security;
alter table public.class_session_events     enable row level security;
alter table public.group_focus              enable row level security;

revoke all on public.academy_group_members, public.class_sessions, public.class_session_techniques,
  public.class_session_media, public.class_session_events, public.group_focus from anon, authenticated;
grant select on public.academy_group_members, public.class_sessions, public.class_session_techniques,
  public.class_session_media, public.class_session_events, public.group_focus to authenticated;
revoke all on sequence public.class_session_events_id_seq from anon, authenticated;

drop policy if exists uzu_group_members_select on public.academy_group_members;
create policy uzu_group_members_select on public.academy_group_members for select to authenticated
  using (exists (select 1 from public.academy_members m where m.id = member_id and m.user_id = auth.uid())
         or public.uzu_can(academy_id, 'students', 'view'));
drop policy if exists uzu_class_sessions_select on public.class_sessions;
create policy uzu_class_sessions_select on public.class_sessions for select to authenticated
  using (public.uzu_journal_readable(class_sessions));
drop policy if exists uzu_class_session_tech_select on public.class_session_techniques;
create policy uzu_class_session_tech_select on public.class_session_techniques for select to authenticated
  using (exists (select 1 from public.class_sessions s where s.id = session_id and public.uzu_journal_readable(s)));
drop policy if exists uzu_class_session_media_select on public.class_session_media;
create policy uzu_class_session_media_select on public.class_session_media for select to authenticated
  using (exists (select 1 from public.class_sessions s where s.id = session_id and public.uzu_journal_readable(s)));
drop policy if exists uzu_class_session_events_select on public.class_session_events;
create policy uzu_class_session_events_select on public.class_session_events for select to authenticated
  using (exists (select 1 from public.class_sessions s where s.id = session_id
                  and public.uzu_can_journal(s.academy_id, 'view', s.section_id, s.course_key)));
drop policy if exists uzu_group_focus_select on public.group_focus;
create policy uzu_group_focus_select on public.group_focus for select to authenticated
  using (section_id = any (public.uzu_my_groups(academy_id)) or (public.uzu_staff_member(academy_id)).id is not null);

-- -----------------------------------------------------------------------------------------
-- 5. Fonctions serveur (académie ACTIVE lue côté serveur, droits vérifiés, historique)
-- -----------------------------------------------------------------------------------------
-- Créer ou modifier une séance ; p_publish = true la publie (droit « publier » requis).
-- p : {section_id, course_key, session_date, discipline_id, theme, objective, exercises, comment,
--      previous_session_id, techniques: [{"t":"G18"} | {"text":"…"}]}
create or replace function public.journal_save_session(p_id uuid, p jsonb, p_publish boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy();
  v_old public.class_sessions; v_sec uuid; v_course text; v_date date; v_disc text; v_theme text;
  v_prev uuid; v_id uuid; v_status text; v_gname text; v_meta_sec uuid; v_e jsonb; v_n int := 0; v_focus jsonb;
begin
  if v_a is null or (public.uzu_staff_member(v_a)).id is null then raise exception 'Action non autorisée'; end if;
  v_sec    := public.uzu_try_uuid(p->>'section_id');
  v_course := nullif(btrim(coalesce(p->>'course_key', '')), '');
  begin v_date := (p->>'session_date')::date; exception when others then raise exception 'Date invalide'; end;
  v_disc   := nullif(btrim(coalesce(p->>'discipline_id', '')), '');
  v_theme  := btrim(coalesce(p->>'theme', ''));
  v_prev   := public.uzu_try_uuid(p->>'previous_session_id');
  if v_date is null or v_date < date '2000-01-01' or v_date > current_date + 60 then raise exception 'Date invalide'; end if;
  if length(v_theme) not between 1 and 120 then raise exception 'Thème obligatoire (120 caractères au plus)'; end if;
  if length(coalesce(p->>'objective', '')) > 500 or length(coalesce(p->>'exercises', '')) > 2000 or length(coalesce(p->>'comment', '')) > 2000 then
    raise exception 'Texte trop long'; end if;
  select name into v_gname from public.academy_sections where id = v_sec and academy_id = v_a;
  if v_gname is null then raise exception 'Choisis le groupe de la séance'; end if;
  if v_course is not null then
    if not exists (select 1 from public.clubs c, jsonb_array_elements(c.schedule) x where c.id = v_a and x->>'id' = v_course) then raise exception 'Cours inconnu'; end if;
    select section_id into v_meta_sec from public.course_meta where academy_id = v_a and course_key = v_course;
    if v_meta_sec is not null and v_meta_sec <> v_sec then raise exception 'Ce cours appartient à un autre groupe'; end if;
  end if;
  if v_disc is not null and not (v_disc = any (public.uzu_lib_disciplines(v_a))) then raise exception 'Discipline non ouverte dans le club'; end if;
  if v_prev is not null and not exists (select 1 from public.class_sessions where id = v_prev and academy_id = v_a and section_id = v_sec) then
    raise exception 'Séance précédente introuvable dans ce groupe'; end if;
  if jsonb_typeof(coalesce(p->'techniques', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'techniques', '[]'::jsonb)) > 30 then
    raise exception 'Liste de techniques invalide (30 au plus)'; end if;

  if p_id is null then
    if not public.uzu_can_journal(v_a, 'create', v_sec, v_course) then raise exception 'Droit requis : ajouter une séance pour ce groupe'; end if;
  else
    select * into v_old from public.class_sessions where id = p_id and academy_id = v_a for update;
    if v_old.id is null then raise exception 'Séance introuvable'; end if;
    if v_old.author_id = v_uid then
      if not public.uzu_can_journal(v_a, 'create', v_sec, v_course) then raise exception 'Droit requis : modifier ses séances'; end if;
    elsif not (public.uzu_can_journal(v_a, 'update', v_old.section_id, v_old.course_key) and public.uzu_can_journal(v_a, 'update', v_sec, v_course)) then
      raise exception 'Droit requis : modifier les séances des autres professeurs';
    end if;
    if v_prev = p_id then raise exception 'Une séance ne peut pas se suivre elle-même'; end if;
  end if;
  if coalesce(p_publish, false) and not public.uzu_can_journal(v_a, 'approve', v_sec, v_course) then raise exception 'Droit requis : publier une séance'; end if;

  v_status := case when coalesce(p_publish, false) then 'publie' else coalesce(v_old.status, 'brouillon') end;
  -- Focus du moment, gardé avec la séance : celui du groupe, sinon celui du club
  select jsonb_build_object('theme', theme, 'from', focus_from, 'to', focus_to, 'source', 'groupe') into v_focus
    from public.group_focus where section_id = v_sec and unpublished_at is null order by published_at desc limit 1;
  if v_focus is null then
    select jsonb_build_object('theme', coalesce(tactical_focus->>'weekTheme', ''), 'from', coalesce(tactical_focus->>'focusFrom', ''),
                              'to', coalesce(tactical_focus->>'focusTo', ''), 'source', 'club') into v_focus from public.clubs where id = v_a;
  end if;

  if p_id is null then
    insert into public.class_sessions (academy_id, section_id, group_name, course_key, session_date, discipline_id, theme, objective,
      exercises, comment, previous_session_id, focus_snapshot, status, author_id, updated_by, published_at, published_by)
    values (v_a, v_sec, v_gname, v_course, v_date, v_disc, v_theme, btrim(coalesce(p->>'objective', '')),
      btrim(coalesce(p->>'exercises', '')), btrim(coalesce(p->>'comment', '')), v_prev, coalesce(v_focus, '{}'::jsonb), v_status,
      v_uid, v_uid, case when v_status = 'publie' then now() end, case when v_status = 'publie' then v_uid end)
    returning id into v_id;
  else
    v_id := p_id;
    update public.class_sessions set section_id = v_sec, group_name = v_gname, course_key = v_course, session_date = v_date,
      discipline_id = v_disc, theme = v_theme, objective = btrim(coalesce(p->>'objective', '')),
      exercises = btrim(coalesce(p->>'exercises', '')), comment = btrim(coalesce(p->>'comment', '')),
      previous_session_id = v_prev, status = v_status, updated_by = v_uid, updated_at = now(),
      published_at = case when v_status = 'publie' and v_old.status <> 'publie' then now() else published_at end,
      published_by = case when v_status = 'publie' and v_old.status <> 'publie' then v_uid else published_by end
     where id = v_id;
    delete from public.class_session_techniques where session_id = v_id;
  end if;
  for v_e in select * from jsonb_array_elements(coalesce(p->'techniques', '[]'::jsonb)) loop
    v_n := v_n + 1;
    if v_e ? 't' then
      if not public.uzu_lib_tech_ok(v_a, v_e->>'t') then raise exception 'Fiche inconnue : %', v_e->>'t'; end if;
      insert into public.class_session_techniques (session_id, position, technique_id) values (v_id, v_n, v_e->>'t');
    elsif length(btrim(coalesce(v_e->>'text', ''))) between 1 and 120 then
      insert into public.class_session_techniques (session_id, position, free_text) values (v_id, v_n, btrim(v_e->>'text'));
    else raise exception 'Technique invalide'; end if;
  end loop;
  perform public.uzu_journal_event(v_a, v_id,
    case when p_id is null then 'creation' else 'modification' end || case when coalesce(p_publish, false) and coalesce(v_old.status, '') <> 'publie' then '+publication' else '' end,
    jsonb_build_object('techniques', v_n, 'statut', v_status));
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;

-- Publier ou dépublier (jamais effacer)
create or replace function public.journal_set_status(p_id uuid, p_status text) returns text
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_s public.class_sessions;
begin
  if p_status not in ('publie','depublie') then raise exception 'Statut invalide'; end if;
  select * into v_s from public.class_sessions where id = p_id and academy_id = v_a for update;
  if v_s.id is null then raise exception 'Séance introuvable'; end if;
  if not public.uzu_can_journal(v_a, 'approve', v_s.section_id, v_s.course_key) then raise exception 'Droit requis : publier une séance'; end if;
  if v_s.status = p_status then return p_status; end if;
  update public.class_sessions set status = p_status, updated_by = v_uid, updated_at = now(),
         published_at = case when p_status = 'publie' then now() else published_at end,
         published_by = case when p_status = 'publie' then v_uid else published_by end
   where id = p_id;
  perform public.uzu_journal_event(v_a, p_id, case when p_status = 'publie' then 'publication' else 'depublication' end, '{}'::jsonb);
  return p_status;
end $$;

-- Fil du Journal (adhérent : ses groupes, séances publiées ; équipe : selon ses droits)
-- Filtres facultatifs : groupe, discipline, période, recherche (thème, technique, texte libre)
create or replace function public.journal_feed(p_section uuid, p_discipline text, p_from date, p_to date, p_query text, p_limit int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_q text := lower(btrim(coalesce(p_query, '')));
begin
  if v_a is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(r order by (r->>'session_date') desc, (r->>'created_at') desc) from (
    select jsonb_build_object(
      'id', s.id, 'section_id', s.section_id, 'group_name', s.group_name, 'course_key', s.course_key,
      'session_date', s.session_date, 'discipline_id', s.discipline_id, 'theme', s.theme, 'objective', s.objective,
      'exercises', s.exercises, 'comment', s.comment, 'previous_session_id', s.previous_session_id, 'status', s.status,
      'focus', s.focus_snapshot, 'created_at', s.created_at, 'published_at', s.published_at, 'mine', s.author_id = v_uid,
      'author_name', coalesce((select nullif(m.display_name, '') from public.academy_members m where m.academy_id = s.academy_id and m.user_id = s.author_id), 'Équipe'),
      'techniques', coalesce((select jsonb_agg(jsonb_build_object('id', t.technique_id, 'name', lt.name, 'text', t.free_text) order by t.position)
                                from public.class_session_techniques t left join public.lib_techniques lt on lt.id = t.technique_id
                               where t.session_id = s.id), '[]'::jsonb),
      'media', (select count(*) from public.class_session_media md where md.session_id = s.id),
      'can_edit', (public.uzu_staff_member(s.academy_id)).id is not null and (
                    (s.author_id = v_uid and public.uzu_can_journal(s.academy_id, 'create', s.section_id, s.course_key))
                    or public.uzu_can_journal(s.academy_id, 'update', s.section_id, s.course_key)),
      'can_publish', (public.uzu_staff_member(s.academy_id)).id is not null and public.uzu_can_journal(s.academy_id, 'approve', s.section_id, s.course_key)
    ) as r
    from public.class_sessions s
   where s.academy_id = v_a and public.uzu_journal_readable(s)
     and (p_section is null or s.section_id = p_section)
     and (p_discipline is null or s.discipline_id = p_discipline)
     and (p_from is null or s.session_date >= p_from) and (p_to is null or s.session_date <= p_to)
     and (v_q = '' or position(v_q in lower(s.theme)) > 0 or exists (
            select 1 from public.class_session_techniques t left join public.lib_techniques lt on lt.id = t.technique_id
             where t.session_id = s.id and (position(v_q in lower(coalesce(lt.name, ''))) > 0 or lower(coalesce(t.technique_id, '')) = v_q
                                            or position(v_q in lower(coalesce(t.free_text, ''))) > 0)))
   order by s.session_date desc, s.created_at desc
   limit greatest(1, least(coalesce(p_limit, 100), 500))) x), '[]'::jsonb);
end $$;

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

-- Focus d'un groupe : publier (p_focus non vide) ou dépublier (p_focus null) ; l'historique reste
create or replace function public.set_group_focus(p_section uuid, p_focus jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_theme text;
begin
  if v_a is null or not public.uzu_can(v_a, 'contents', 'create') then raise exception 'Droit requis : publier un focus'; end if;
  if not exists (select 1 from public.academy_sections where id = p_section and academy_id = v_a) then raise exception 'Groupe inconnu'; end if;
  update public.group_focus set unpublished_at = now() where section_id = p_section and unpublished_at is null;
  if p_focus is null then
    perform public.uzu_audit(v_a, 'focus.group_unpublished', 'section', p_section::text, '{}'::jsonb); return false;
  end if;
  v_theme := btrim(coalesce(p_focus->>'theme', ''));
  if length(v_theme) not between 1 and 100 or length(coalesce(p_focus->>'details', '')) > 300 then raise exception 'Focus invalide'; end if;
  insert into public.group_focus (academy_id, section_id, theme, focus_from, focus_to, details, published_by)
  values (v_a, p_section, v_theme, left(coalesce(p_focus->>'from', ''), 20), left(coalesce(p_focus->>'to', ''), 20), btrim(coalesce(p_focus->>'details', '')), v_uid);
  perform public.uzu_audit(v_a, 'focus.group_published', 'section', p_section::text, jsonb_build_object('theme', v_theme));
  return true;
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

revoke all on function public.uzu_my_groups(uuid) from public, anon;
revoke all on function public.uzu_can_journal(uuid, text, uuid, text) from public, anon;
revoke all on function public.uzu_journal_readable(public.class_sessions) from public, anon;
revoke all on function public.uzu_journal_event(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.journal_save_session(uuid, jsonb, boolean) from public, anon;
revoke all on function public.journal_set_status(uuid, text) from public, anon;
revoke all on function public.journal_feed(uuid, text, date, date, text, int) from public, anon;
revoke all on function public.journal_groups() from public, anon;
revoke all on function public.set_member_groups(uuid, uuid[]) from public, anon;
revoke all on function public.set_group_focus(uuid, jsonb) from public, anon;
revoke all on function public.student_groups(uuid) from public, anon;
revoke all on function public.set_student_groups(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.uzu_my_groups(uuid) to authenticated;
grant execute on function public.uzu_can_journal(uuid, text, uuid, text) to authenticated;
grant execute on function public.uzu_journal_readable(public.class_sessions) to authenticated;
grant execute on function public.journal_save_session(uuid, jsonb, boolean) to authenticated;
grant execute on function public.journal_set_status(uuid, text) to authenticated;
grant execute on function public.journal_feed(uuid, text, date, date, text, int) to authenticated;
grant execute on function public.journal_groups() to authenticated;
grant execute on function public.set_member_groups(uuid, uuid[]) to authenticated;
grant execute on function public.set_group_focus(uuid, jsonb) to authenticated;
grant execute on function public.student_groups(uuid) to authenticated;
grant execute on function public.set_student_groups(uuid, uuid, uuid[]) to authenticated;

commit;

-- Contrôle : doit afficher 6 tables, la ressource « class_journal » et true pour les modèles
select (select count(*) from pg_tables where schemaname = 'public'
          and tablename in ('academy_group_members','class_sessions','class_session_techniques','class_session_media','class_session_events','group_focus')) as tables_ajoutees,
       public.uzu_perm_catalog() ? 'class_journal' as droit_journal,
       public.uzu_perm_catalog() ? 'library' as droit_bibliotheque_conserve,
       jsonb_path_exists(public.uzu_perm_template('instructor'), '$[*] ? (@.r == "class_journal")') as modele_professeur;
