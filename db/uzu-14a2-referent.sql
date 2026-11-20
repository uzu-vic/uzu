-- =========================================================================================
-- UZU — « OÙ ROULER ? » ÉTAPE 1 (fin) : RÔLE DE RÉFÉRENT UZU ET OUTILS DE MODÉRATION
--   • Rôle dédié « référent UZU » (table dir_moderators) : droits limités à l'annuaire.
--     Il est distinct des administrateurs de la plateforme (uzu_platform_admins), qui gardent
--     leurs droits actuels (archives du catalogue) mais ne modèrent plus l'annuaire à ce titre.
--   • AUCUN compte n'est désigné par ce script : la table est créée vide.
--     La désignation se fait plus tard, par db/ou-rouler/designer-referent.sql, après décision.
--   • Le référent : saisit et publie les fiches référencées, traite les propositions,
--     peut masquer la fiche d'un club client (abus, erreur grave) sans pouvoir la modifier.
--     Le club ne peut pas republier une fiche masquée par la modération tant que le masquage
--     n'est pas levé.
--   • Journal de modération : chaque action du référent est enregistrée.
-- Prérequis : uzu-14a0, uzu-14a. Ajout seul pour l'existant : aucune table, colonne, donnée ou
-- règle d'avant « Où rouler ? » n'est modifiée. Remplace des fonctions dir_* créées par uzu-14a.
-- Rejouable.
-- =========================================================================================
begin;

do $$ begin
  if to_regprocedure('public.dir_search(text,integer,text,text,integer)') is null then
    raise exception 'Annuaire absent : applique uzu-14a d''abord';
  end if;
end $$;

-- -----------------------------------------------------------------------------------------
-- 1. Rôle, journal, colonnes de modération (tables de l'annuaire uniquement)
-- -----------------------------------------------------------------------------------------
create table if not exists public.dir_moderators (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  label       text not null default 'Référent UZU' check (length(label) between 2 and 60),
  active      boolean not null default true,
  granted_at  timestamptz not null default now(),
  granted_note text not null default '' check (length(granted_note) <= 200),
  revoked_at  timestamptz
);

create table if not exists public.dir_moderation_log (
  id       bigint generated always as identity primary key,
  actor    uuid references auth.users (id) on delete set null,
  action   text not null check (action ~ '^[a-z_.]{3,40}$'),
  target   text not null default '' check (length(target) <= 120),
  details  jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and length(details::text) <= 1000),
  at       timestamptz not null default now()
);
create index if not exists dir_moderation_log_at_idx on public.dir_moderation_log (at desc);

alter table public.dir_clubs add column if not exists moderated_at timestamptz;
alter table public.dir_clubs add column if not exists moderation_note text not null default '' check (length(moderation_note) <= 200);

alter table public.dir_moderators enable row level security;
alter table public.dir_moderation_log enable row level security;
revoke all on public.dir_moderators, public.dir_moderation_log from anon, authenticated;

-- -----------------------------------------------------------------------------------------
-- 2. Outils
-- -----------------------------------------------------------------------------------------
create or replace function public.dir_is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.dir_moderators where user_id = auth.uid() and active and revoked_at is null)
$$;

create or replace function public.dir_require_moderator() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v uuid := public.uzu_require_auth();
begin
  if not public.dir_is_moderator() then raise exception 'Action réservée au référent UZU'; end if;
  return v;
end $$;

create or replace function public.dir_mod_log(p_action text, p_target text, p_details jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.dir_moderation_log (actor, action, target, details) values (auth.uid(), p_action, left(coalesce(p_target, ''), 120), coalesce(p_details, '{}'::jsonb))
$$;

-- Conditions d'accueil : seules les clés connues, textes courts (commune aux deux saisies)
create or replace function public.dir_clean_welcome(p jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(p) <> 'object' then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object(
    'price', nullif(left(btrim(coalesce(p->>'price', '')), 60), ''),
    'license', nullif(left(btrim(coalesce(p->>'license', '')), 120), ''),
    'rules', nullif(left(btrim(coalesce(p->>'rules', '')), 200), ''),
    'contact_first', case when (p->>'contact_first') in ('true','false') then (p->>'contact_first')::boolean end,
    'notes', nullif(left(btrim(coalesce(p->>'notes', '')), 300), ''))) end
$$;

-- Qui suis-je pour l'annuaire (affiche ou non l'espace référent)
create or replace function public.dir_whoami() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('moderator', public.dir_is_moderator())
$$;

-- -----------------------------------------------------------------------------------------
-- 3. Fiche : lisible du référent quel que soit son état
-- -----------------------------------------------------------------------------------------
create or replace function public.dir_get(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); d public.dir_clubs; g public.geo_communes; v_mod boolean := public.dir_is_moderator();
begin
  select * into d from public.dir_clubs where slug = p_slug;
  if d.id is null or (d.status <> 'published' and not v_mod
      and not (d.club_id is not null and d.club_id = public.uzu_active_academy() and public.uzu_can(d.club_id, 'academy_settings', 'view'))) then
    raise exception 'Fiche introuvable';
  end if;
  select * into g from public.geo_communes where insee = d.insee;
  return jsonb_build_object('slug', d.slug, 'name', d.name, 'uzu', d.club_id is not null, 'status', d.status,
    'commune', g.nom, 'dep', g.departement, 'insee', d.insee, 'address', d.address, 'disciplines', d.disciplines,
    'description', d.description, 'website', d.website, 'instagram', d.instagram, 'phone', d.phone, 'email', d.email,
    'welcome', d.welcome, 'verified_at', d.verified_at, 'sessions', public.dir_club_sessions(d.id))
    || case when v_mod then jsonb_build_object('origin', d.origin, 'moderated', d.moderated_at is not null, 'moderation_note', d.moderation_note) else '{}'::jsonb end;
end $$;

-- -----------------------------------------------------------------------------------------
-- 4. Fiche du club client : un masquage de modération l'emporte sur « publier »
-- -----------------------------------------------------------------------------------------
create or replace function public.dir_my_club() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); c public.clubs; d public.dir_clubs;
begin
  if v_a is null or not public.uzu_can(v_a, 'academy_settings', 'view') then raise exception 'Action non autorisée'; end if;
  select * into c from public.clubs where id = v_a;
  select * into d from public.dir_clubs where club_id = v_a;
  return jsonb_build_object(
    'exists', d.id is not null, 'can_edit', public.uzu_can(v_a, 'academy_settings', 'update'),
    'slug', d.slug, 'status', coalesce(d.status, 'draft'), 'name', coalesce(d.name, c.name),
    'moderated', d.moderated_at is not null,
    'insee', d.insee, 'commune', (select nom || ' (' || departement || ')' from public.geo_communes where insee = d.insee),
    'address', coalesce(d.address, left(coalesce(c.profile->>'addr', ''), 160)),
    'disciplines', coalesce(to_jsonb(d.disciplines), '[]'::jsonb),
    'description', coalesce(d.description, left(coalesce(c.profile->>'desc', ''), 500)),
    'website', coalesce(d.website, ''), 'instagram', coalesce(d.instagram, ''), 'phone', coalesce(d.phone, ''), 'email', coalesce(d.email, ''),
    'welcome', coalesce(d.welcome, '{}'::jsonb),
    'slots', coalesce((select jsonb_agg(jsonb_build_object('id', e->>'id', 'd', (e->>'d')::int, 's', e->>'s', 'e', e->>'e', 't', coalesce(e->>'t', ''),
                         'disc', public.dir_disc(e->>'disc'), 'course_kind', coalesce(e->>'kind', ''),
                         'pub', sl.slot_id is not null, 'kind', sl.kind, 'price', coalesce(sl.price, ''), 'notes', coalesce(sl.notes, ''))
                         order by (e->>'d')::int, e->>'s')
                       from jsonb_array_elements(case when jsonb_typeof(c.schedule) = 'array' then c.schedule else '[]'::jsonb end) e
                       left join public.dir_club_slots sl on sl.club_id = v_a and sl.slot_id = e->>'id'
                      where (e->>'d') ~ '^[0-6]$' and coalesce(e->>'id', '') <> ''), '[]'::jsonb));
end $$;

create or replace function public.dir_my_club_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); c public.clubs; d public.dir_clubs;
  v_slug text; v_ids text[]; s jsonb; n int := 0; v_pub boolean := coalesce((p->>'published')::boolean, false);
begin
  if v_a is null or not public.uzu_can(v_a, 'academy_settings', 'update') then raise exception 'Action non autorisée : droit « Paramètres de l''académie » requis'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Données invalides'; end if;
  select * into c from public.clubs where id = v_a;
  if not exists (select 1 from public.geo_communes where insee = p->>'insee') then raise exception 'Choisis la commune de la salle'; end if;
  if jsonb_typeof(coalesce(p->'disciplines', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'disciplines', '[]'::jsonb)) = 0 then
    raise exception 'Choisis au moins une discipline';
  end if;
  select * into d from public.dir_clubs where club_id = v_a for update;
  if d.id is null then
    v_slug := left(public.dir_slugify(coalesce(nullif(btrim(p->>'name'), ''), c.name) || '-' || (select nom from public.geo_communes where insee = p->>'insee')), 80);
    if length(v_slug) < 3 then v_slug := 'club-' || left(replace(v_a::text, '-', ''), 8); end if;
    if exists (select 1 from public.dir_clubs where slug = v_slug) then v_slug := left(v_slug, 80) || '-' || left(replace(v_a::text, '-', ''), 6); end if;
    insert into public.dir_clubs (club_id, slug, name, insee, origin, created_by) values (v_a, v_slug, coalesce(nullif(btrim(p->>'name'), ''), c.name), p->>'insee', 'uzu_client', v_uid)
    returning * into d;
  end if;
  update public.dir_clubs set
    name = coalesce(nullif(btrim(p->>'name'), ''), c.name), insee = p->>'insee',
    address = btrim(coalesce(p->>'address', '')),
    disciplines = array(select distinct x from jsonb_array_elements_text(p->'disciplines') x where x in ('jjb_gi','grappling_nogi')),
    description = btrim(coalesce(p->>'description', '')),
    website = btrim(coalesce(p->>'website', '')), instagram = ltrim(btrim(coalesce(p->>'instagram', '')), '@'),
    phone = btrim(coalesce(p->>'phone', '')), email = lower(btrim(coalesce(p->>'email', ''))),
    welcome = public.dir_clean_welcome(p->'welcome'),
    status = case when d.moderated_at is not null then 'hidden' when v_pub then 'published' else 'hidden' end,
    verified_at = now(), updated_at = now()
  where id = d.id;
  if jsonb_typeof(p->'slots') = 'array' then
    select array_agg(e->>'id') into v_ids from jsonb_array_elements(case when jsonb_typeof(c.schedule) = 'array' then c.schedule else '[]'::jsonb end) e;
    delete from public.dir_club_slots where club_id = v_a;
    for s in select * from jsonb_array_elements(p->'slots') loop
      if not (s->>'id' = any (coalesce(v_ids, '{}'))) then raise exception 'Créneau inconnu dans le planning du club'; end if;
      if s->>'kind' not in ('open_mat','open_class','trial') then raise exception 'Type de créneau inconnu'; end if;
      insert into public.dir_club_slots (club_id, slot_id, kind, price, notes)
      values (v_a, s->>'id', s->>'kind', left(btrim(coalesce(s->>'price', '')), 40), left(btrim(coalesce(s->>'notes', '')), 160))
      on conflict (club_id, slot_id) do update set kind = excluded.kind, price = excluded.price, notes = excluded.notes;
      n := n + 1;
    end loop;
  end if;
  perform public.uzu_audit(v_a, 'directory.club_saved', 'dir_club', d.id::text,
    jsonb_build_object('published', v_pub and d.moderated_at is null, 'slots', n));
  return jsonb_build_object('ok', true, 'slug', d.slug, 'slots', n, 'moderated', d.moderated_at is not null);
end $$;

-- -----------------------------------------------------------------------------------------
-- 5. Outils du référent UZU
-- -----------------------------------------------------------------------------------------
-- Fiches (clientes et référencées), tous états, filtrables par département, texte, état
create or replace function public.dir_admin_list(p_dep text default null, p_q text default null, p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.dir_require_moderator(); v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  return coalesce((select jsonb_agg(jsonb_build_object('slug', d.slug, 'name', d.name, 'uzu', d.club_id is not null, 'origin', d.origin,
           'status', d.status, 'moderated', d.moderated_at is not null, 'commune', g.nom, 'dep', g.departement,
           'n_sessions', jsonb_array_length(public.dir_club_sessions(d.id)), 'verified_at', d.verified_at,
           'open_suggestions', (select count(*) from public.dir_suggestions s where s.dir_club_id = d.id and s.status = 'open'))
           order by g.departement, g.nom, d.name)
    from public.dir_clubs d join public.geo_communes g on g.insee = d.insee
   where (p_dep is null or g.departement = p_dep) and (p_status is null or d.status = p_status)
     and (v_q is null or public.dir_slugify(d.name || ' ' || g.nom) like '%' || public.dir_slugify(v_q) || '%')
   limit 300), '[]'::jsonb);
end $$;

-- Créer ou mettre à jour une fiche référencée et ses créneaux (p : slug?, name, insee, address,
-- disciplines[], description, website, instagram, phone, email, welcome, status, sessions[{d,s,e,disc,kind,price,notes}])
create or replace function public.dir_admin_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.dir_require_moderator(); d public.dir_clubs; v_slug text; s jsonb; v_new boolean := false; n int := 0;
begin
  if jsonb_typeof(p) <> 'object' then raise exception 'Données invalides'; end if;
  if p->>'slug' is not null then
    select * into d from public.dir_clubs where slug = p->>'slug' for update;
    if d.id is null then raise exception 'Fiche introuvable'; end if;
  end if;
  if d.id is not null and d.club_id is not null then raise exception 'Fiche d''un club client : modifiable par le club seulement'; end if;
  if length(btrim(coalesce(p->>'name', ''))) < 2 then raise exception 'Nom du club trop court'; end if;
  if not exists (select 1 from public.geo_communes where insee = p->>'insee') then raise exception 'Choisis la commune de la salle'; end if;
  if d.id is null then
    v_new := true;
    v_slug := left(public.dir_slugify(btrim(p->>'name') || '-' || (select nom from public.geo_communes where insee = p->>'insee')), 80);
    if length(v_slug) < 3 then v_slug := 'club-' || left(md5(random()::text), 8); end if;
    if exists (select 1 from public.dir_clubs where slug = v_slug) then v_slug := left(v_slug, 80) || '-' || left(md5(random()::text), 5); end if;
    insert into public.dir_clubs (slug, name, insee, origin, created_by) values (v_slug, btrim(p->>'name'), p->>'insee', 'uzu_staff', v_uid) returning * into d;
  end if;
  update public.dir_clubs set name = left(btrim(p->>'name'), 80), insee = p->>'insee', address = left(btrim(coalesce(p->>'address', '')), 160),
    disciplines = array(select distinct x from jsonb_array_elements_text(coalesce(p->'disciplines', '[]'::jsonb)) x where x in ('jjb_gi','grappling_nogi')),
    description = left(btrim(coalesce(p->>'description', '')), 500), website = btrim(coalesce(p->>'website', '')),
    instagram = ltrim(btrim(coalesce(p->>'instagram', '')), '@'), phone = btrim(coalesce(p->>'phone', '')), email = lower(btrim(coalesce(p->>'email', ''))),
    welcome = public.dir_clean_welcome(p->'welcome'),
    status = case when p->>'status' in ('draft','published','hidden') then p->>'status' else 'draft' end,
    verified_at = now(), updated_at = now()
  where id = d.id;
  if jsonb_typeof(p->'sessions') = 'array' then
    delete from public.dir_sessions where dir_club_id = d.id;
    for s in select * from jsonb_array_elements(p->'sessions') loop
      if s->>'kind' not in ('open_mat','open_class','trial') then raise exception 'Type de créneau inconnu'; end if;
      if coalesce((s->>'d')::int, -1) not between 0 and 6 then raise exception 'Jour de créneau inconnu'; end if;
      if coalesce(s->>'s', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(s->>'e', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Heure de créneau invalide (HH:MM)'; end if;
      insert into public.dir_sessions (dir_club_id, weekday, start_t, end_t, discipline, kind, price, notes)
      values (d.id, (s->>'d')::int, s->>'s', s->>'e', public.dir_disc(s->>'disc'), s->>'kind', left(coalesce(s->>'price', ''), 40), left(coalesce(s->>'notes', ''), 160));
      n := n + 1;
    end loop;
  end if;
  perform public.dir_mod_log(case when v_new then 'club.created' else 'club.updated' end, d.slug,
    jsonb_build_object('status', case when p->>'status' in ('draft','published','hidden') then p->>'status' else 'draft' end, 'sessions', n));
  return jsonb_build_object('ok', true, 'slug', d.slug);
end $$;

-- Publier / masquer. Fiche cliente : masquage de modération seulement (avec motif), ou levée du masquage.
create or replace function public.dir_admin_set_status(p_slug text, p_status text, p_note text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.dir_require_moderator(); d public.dir_clubs;
begin
  select * into d from public.dir_clubs where slug = p_slug for update;
  if d.id is null then raise exception 'Fiche introuvable'; end if;
  if d.club_id is null then
    if p_status not in ('draft','published','hidden') then raise exception 'État inconnu'; end if;
    update public.dir_clubs set status = p_status, updated_at = now() where id = d.id;
  else
    if p_status = 'moderated' then
      if length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Indique le motif du masquage'; end if;
      update public.dir_clubs set status = 'hidden', moderated_at = now(), moderation_note = left(btrim(p_note), 200), updated_at = now() where id = d.id;
    elsif p_status = 'unmoderated' then
      -- La fiche reste masquée : c'est le club qui choisit de la republier.
      update public.dir_clubs set moderated_at = null, moderation_note = '', updated_at = now() where id = d.id;
    else
      raise exception 'Fiche d''un club client : seul le masquage de modération est possible';
    end if;
  end if;
  perform public.dir_mod_log('club.status', d.slug, jsonb_build_object('status', p_status, 'note', left(coalesce(p_note, ''), 200)));
  return jsonb_build_object('ok', true);
end $$;

-- Remplace la version sans paramètre d'uzu-14a
drop function if exists public.dir_admin_suggestions();
create or replace function public.dir_admin_suggestions(p_status text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.dir_require_moderator();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'club', d.name, 'slug', d.slug, 'uzu', d.club_id is not null,
                     'payload', s.payload, 'status', s.status, 'at', s.created_at, 'resolved_at', s.resolved_at)
                     order by (s.status = 'open') desc, s.created_at desc)
                     from (select * from public.dir_suggestions where p_status is null or status = p_status order by created_at desc limit 200) s
                     left join public.dir_clubs d on d.id = s.dir_club_id), '[]'::jsonb);
end $$;

create or replace function public.dir_admin_resolve(p_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.dir_require_moderator();
begin
  if p_status not in ('accepted','rejected','open') then raise exception 'État inconnu'; end if;
  update public.dir_suggestions set status = p_status, resolved_at = case when p_status = 'open' then null else now() end,
         resolved_by = case when p_status = 'open' then null else v_uid end where id = p_id;
  if found then perform public.dir_mod_log('suggestion.' || p_status, p_id::text); end if;
  return found;
end $$;

-- Journal : actions des référents (nom affiché, jamais l'adresse électronique)
create or replace function public.dir_admin_log(p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.dir_require_moderator();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'target', l.target, 'details', l.details, 'at', l.at,
                     'actor', coalesce(m.label, 'Référent UZU') || coalesce(' · ' || nullif(p.display_name, ''), '')) order by l.at desc)
                     from (select * from public.dir_moderation_log order by at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) l
                     left join public.dir_moderators m on m.user_id = l.actor
                     left join public.profiles p on p.user_id = l.actor), '[]'::jsonb);
end $$;

-- L'ancien contrôle d'accès par administrateur de plateforme n'est plus utilisé par l'annuaire
revoke all on function public.uzu_platform_admin() from authenticated;

-- -----------------------------------------------------------------------------------------
-- 6. Droits d'exécution
-- -----------------------------------------------------------------------------------------
revoke all on function public.dir_is_moderator() from public, anon;
revoke all on function public.dir_require_moderator() from public, anon, authenticated;
revoke all on function public.dir_mod_log(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.dir_clean_welcome(jsonb) from public, anon, authenticated;
revoke all on function public.dir_whoami() from public, anon;
revoke all on function public.dir_get(text) from public, anon;
revoke all on function public.dir_my_club() from public, anon;
revoke all on function public.dir_my_club_save(jsonb) from public, anon;
revoke all on function public.dir_admin_list(text, text, text) from public, anon;
revoke all on function public.dir_admin_save(jsonb) from public, anon;
revoke all on function public.dir_admin_set_status(text, text, text) from public, anon;
revoke all on function public.dir_admin_suggestions(text) from public, anon;
revoke all on function public.dir_admin_resolve(uuid, text) from public, anon;
revoke all on function public.dir_admin_log(int) from public, anon;
grant execute on function public.dir_is_moderator() to authenticated;
grant execute on function public.dir_whoami() to authenticated;
grant execute on function public.dir_get(text) to authenticated;
grant execute on function public.dir_my_club() to authenticated;
grant execute on function public.dir_my_club_save(jsonb) to authenticated;
grant execute on function public.dir_admin_list(text, text, text) to authenticated;
grant execute on function public.dir_admin_save(jsonb) to authenticated;
grant execute on function public.dir_admin_set_status(text, text, text) to authenticated;
grant execute on function public.dir_admin_suggestions(text) to authenticated;
grant execute on function public.dir_admin_resolve(uuid, text) to authenticated;
grant execute on function public.dir_admin_log(int) to authenticated;

commit;

-- Contrôle : 2 tables ajoutées et fermées, AUCUN référent désigné, rien pour les visiteurs non connectés
select (select count(*) from pg_tables where schemaname = 'public' and tablename in ('dir_moderators','dir_moderation_log')) as tables_ajoutees,
       (select count(*) from public.dir_moderators) as referents_designes,
       (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name like 'dir\_%' and grantee in ('anon','authenticated')) as droits_directs,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'dir\_%' and has_function_privilege('anon', p.oid, 'execute')
           and p.proname not in ('dir_disc','dir_slugify','dir_band')) as fonctions_pour_anon;
