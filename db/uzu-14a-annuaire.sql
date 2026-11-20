-- =========================================================================================
-- UZU — « OÙ ROULER ? » ÉTAPE 1 : ANNUAIRE PRIVÉ DES CLUBS
--   • Fiches de clubs : clubs clients UZU (fiche activée par le club lui-même) et clubs référencés
--     (fiches saisies ou validées par l'équipe UZU). Badge « Club UZU » = fiche liée à un club client.
--   • Créneaux publiés : open mats, cours ouverts aux visiteurs, cours d'essai.
--       - club client : il coche, dans son planning existant, les créneaux ouverts aux visiteurs
--         (table dir_club_slots) ; le planning (clubs.schedule) n'est PAS modifié ;
--       - club référencé : créneaux saisis par l'équipe UZU (table dir_sessions).
--   • Recherche par commune et rayon (centres des communes, uzu-14a0), discipline, type, jour.
--   • Annuaire PRIVÉ : réservé aux personnes connectées (indépendants compris). Rien pour anon.
--   • Toutes les tables sont fermées au navigateur : lecture et écriture par fonctions serveur.
--   • Propositions de clubs par les pratiquants, traitées par l'équipe UZU (uzu_platform_admins).
-- Prérequis : uzu-14a0-communes.sql (communes chargées).
-- Ajout seul : aucune table, colonne, donnée ou règle existante n'est modifiée. Rejouable.
-- =========================================================================================
begin;

do $$ begin
  if to_regclass('public.geo_communes') is null then raise exception 'Référentiel des communes absent : applique uzu-14a0 d''abord'; end if;
end $$;

-- -----------------------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------------------
create table if not exists public.dir_clubs (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid unique references public.clubs (id) on delete cascade,      -- club client UZU
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 90),
  name         text not null check (length(btrim(name)) between 2 and 80),
  insee        text not null references public.geo_communes (insee),
  address      text not null default '' check (length(address) <= 160),        -- adresse de la SALLE
  disciplines  text[] not null default '{}' check (disciplines <@ array['jjb_gi','grappling_nogi']::text[]),
  description  text not null default '' check (length(description) <= 500),
  website      text not null default '' check (website = '' or website ~ '^https://[^[:space:]]{3,200}$'),
  instagram    text not null default '' check (instagram = '' or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  phone        text not null default '' check (phone = '' or phone ~ '^[+0-9 .()-]{6,20}$'),
  email        text not null default '' check (email = '' or email ~* '^[^@[:space:]]{1,64}@[^@[:space:]]{1,120}\.[a-z]{2,}$'),
  welcome      jsonb not null default '{}'::jsonb check (jsonb_typeof(welcome) = 'object' and length(welcome::text) <= 1200),
  origin       text not null check (origin in ('uzu_client','uzu_staff','suggestion')),
  status       text not null default 'draft' check (status in ('draft','published','hidden')),
  verified_at  timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((origin = 'uzu_client') = (club_id is not null))
);
create index if not exists dir_clubs_insee_idx on public.dir_clubs (insee) where status = 'published';

-- Créneaux des clubs référencés (saisis par l'équipe UZU). Jour : 0 = lundi … 6 = dimanche (comme clubs.schedule).
create table if not exists public.dir_sessions (
  id           uuid primary key default gen_random_uuid(),
  dir_club_id  uuid not null references public.dir_clubs (id) on delete cascade,
  weekday      int not null check (weekday between 0 and 6),
  start_t      text not null check (start_t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_t        text not null check (end_t ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  discipline   text check (discipline is null or discipline in ('jjb_gi','grappling_nogi')),
  kind         text not null check (kind in ('open_mat','open_class','trial')),
  price        text not null default '' check (length(price) <= 40),
  notes        text not null default '' check (length(notes) <= 160)
);
create index if not exists dir_sessions_club_idx on public.dir_sessions (dir_club_id);

-- Créneaux du planning d'un club client ouverts aux visiteurs (le planning lui-même n'est pas modifié)
create table if not exists public.dir_club_slots (
  club_id   uuid not null references public.clubs (id) on delete cascade,
  slot_id   text not null check (length(slot_id) between 1 and 40),
  kind      text not null check (kind in ('open_mat','open_class','trial')),
  price     text not null default '' check (length(price) <= 40),
  notes     text not null default '' check (length(notes) <= 160),
  primary key (club_id, slot_id)
);

-- Propositions de club ou de correction par les pratiquants (traitées par l'équipe UZU)
create table if not exists public.dir_suggestions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete set null,
  dir_club_id  uuid references public.dir_clubs (id) on delete cascade,
  payload      jsonb not null check (jsonb_typeof(payload) = 'object' and length(payload::text) <= 2000),
  status       text not null default 'open' check (status in ('open','accepted','rejected')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references auth.users (id) on delete set null
);
create index if not exists dir_suggestions_status_idx on public.dir_suggestions (status, created_at desc);

alter table public.dir_clubs enable row level security;
alter table public.dir_sessions enable row level security;
alter table public.dir_club_slots enable row level security;
alter table public.dir_suggestions enable row level security;
revoke all on public.dir_clubs, public.dir_sessions, public.dir_club_slots, public.dir_suggestions from anon, authenticated;

-- -----------------------------------------------------------------------------------------
-- 2. Outils
-- -----------------------------------------------------------------------------------------
create or replace function public.uzu_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.uzu_platform_admins where user_id = auth.uid())
$$;

-- Créneau du planning : discipline de la Bibliothèque (jjb → jjb_gi, grappling → grappling_nogi)
create or replace function public.dir_disc(p text) returns text language sql immutable as $$
  select case p when 'jjb' then 'jjb_gi' when 'grappling' then 'grappling_nogi'
                when 'jjb_gi' then 'jjb_gi' when 'grappling_nogi' then 'grappling_nogi' end
$$;

-- Identifiant d'URL : minuscules sans accents, tirets
create or replace function public.dir_slugify(p text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(coalesce(p, ''),
    'àâäáãåéèêëíìîïóòôöõúùûüçñÀÂÄÁÃÅÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇÑ', 'aaaaaaeeeeiiiiooooouuuucnAAAAAAEEEEIIIIOOOOOUUUUCN')), '[^a-z0-9]+', '-', 'g'))
$$;

-- Créneaux publiés d'une fiche (jsonb), triés par jour et heure
create or replace function public.dir_club_sessions(p_dir uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select * from public.dir_clubs where id = p_dir),
  s as (
    select ds.weekday as d, ds.start_t as s, ds.end_t as e, ds.discipline as disc, ds.kind, ds.price, ds.notes, '' as title
      from public.dir_sessions ds join d on d.id = ds.dir_club_id where d.club_id is null
    union all
    select (e->>'d')::int, e->>'s', e->>'e', public.dir_disc(e->>'disc'), sl.kind, sl.price, sl.notes, coalesce(e->>'t', '')
      from d join public.clubs c on c.id = d.club_id
      cross join lateral jsonb_array_elements(case when jsonb_typeof(c.schedule) = 'array' then c.schedule else '[]'::jsonb end) e
      join public.dir_club_slots sl on sl.club_id = c.id and sl.slot_id = e->>'id'
     where (e->>'d') ~ '^[0-6]$' and coalesce((e->>'hol')::boolean, false) = false
  )
  select coalesce(jsonb_agg(jsonb_build_object('d', d, 's', s, 'e', e, 'disc', disc, 'kind', kind, 'price', price, 'notes', notes, 'title', title) order by d, s), '[]'::jsonb) from s
$$;

-- Tranche de distance affichée
create or replace function public.dir_band(p_km numeric) returns text language sql immutable as $$
  select case when p_km is null then '' when p_km < 10 then 'moins de 10 km' when p_km < 25 then '10 à 25 km'
              when p_km < 50 then '25 à 50 km' else '50 à 100 km' end
$$;

-- -----------------------------------------------------------------------------------------
-- 3. Recherche et fiche (personnes connectées)
-- -----------------------------------------------------------------------------------------
create or replace function public.dir_search(p_insee text, p_radius int default 25, p_disc text default null,
  p_kind text default null, p_day int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); o public.geo_communes; r int := least(greatest(coalesce(p_radius, 25), 5), 100);
  dlat numeric; dlon numeric; v jsonb;
begin
  select * into o from public.geo_communes where insee = p_insee;
  if o.insee is null then raise exception 'Commune inconnue'; end if;
  if p_disc is not null and p_disc not in ('jjb_gi','grappling_nogi') then raise exception 'Discipline inconnue'; end if;
  if p_kind is not null and p_kind not in ('open_mat','open_class','trial') then raise exception 'Type de créneau inconnu'; end if;
  if p_day is not null and (p_day < 0 or p_day > 6) then raise exception 'Jour inconnu'; end if;
  dlat := r / 111.0; dlon := r / (111.0 * greatest(cos(radians(o.lat)), 0.2));
  with c as (
    select dc.*, g.nom as commune, g.departement as dep,
           6371 * 2 * asin(sqrt(power(sin(radians(g.lat - o.lat) / 2), 2) + cos(radians(o.lat)) * cos(radians(g.lat)) * power(sin(radians(g.lon - o.lon) / 2), 2))) as km,
           public.dir_club_sessions(dc.id) as sessions
      from public.dir_clubs dc join public.geo_communes g on g.insee = dc.insee
     where dc.status = 'published' and g.lat between o.lat - dlat and o.lat + dlat and g.lon between o.lon - dlon and o.lon + dlon
  ), f as (
    select c.*, (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(c.sessions) x
                  where (p_kind is null or x->>'kind' = p_kind) and (p_day is null or (x->>'d')::int = p_day)
                    and (p_disc is null or x->>'disc' is null or x->>'disc' = p_disc)) as match
      from c where c.km <= r and (p_disc is null or p_disc = any (c.disciplines) or exists (select 1 from jsonb_array_elements(c.sessions) x where x->>'disc' = p_disc))
  )
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'uzu', club_id is not null, 'commune', commune, 'dep', dep,
           'band', public.dir_band(km::numeric), 'disciplines', disciplines, 'sessions', match, 'n_sessions', jsonb_array_length(sessions),
           'price', coalesce(welcome->>'price', ''), 'verified_at', verified_at) order by km, name), '[]'::jsonb)
    into v
    from (select * from f where (p_kind is null and p_day is null) or jsonb_array_length(match) > 0 order by km, name limit 50) z;
  return jsonb_build_object('commune', jsonb_build_object('insee', o.insee, 'nom', o.nom, 'dep', o.departement), 'radius', r, 'clubs', v);
end $$;

create or replace function public.dir_get(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); d public.dir_clubs; g public.geo_communes;
begin
  select * into d from public.dir_clubs where slug = p_slug;
  if d.id is null or (d.status <> 'published' and not public.uzu_platform_admin()
      and not (d.club_id is not null and d.club_id = public.uzu_active_academy() and public.uzu_can(d.club_id, 'academy_settings', 'view'))) then
    raise exception 'Fiche introuvable';
  end if;
  select * into g from public.geo_communes where insee = d.insee;
  return jsonb_build_object('slug', d.slug, 'name', d.name, 'uzu', d.club_id is not null, 'status', d.status,
    'commune', g.nom, 'dep', g.departement, 'insee', d.insee, 'address', d.address, 'disciplines', d.disciplines,
    'description', d.description, 'website', d.website, 'instagram', d.instagram, 'phone', d.phone, 'email', d.email,
    'welcome', d.welcome, 'verified_at', d.verified_at, 'sessions', public.dir_club_sessions(d.id));
end $$;

-- -----------------------------------------------------------------------------------------
-- 4. Fiche du club client (droit « Paramètres de l'académie »)
-- -----------------------------------------------------------------------------------------
-- Lecture : la fiche (ou une proposition préremplie depuis la présentation du club) et le planning
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

-- Enregistrer la fiche et les créneaux ouverts (p : name, insee, address, disciplines[], description, website,
-- instagram, phone, email, welcome{price, license, rules, contact_first, notes}, published, slots[{id, kind, price, notes}])
create or replace function public.dir_my_club_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); c public.clubs; d public.dir_clubs;
  v_slug text; v_ids text[]; s jsonb; n int := 0; w jsonb := '{}'::jsonb;
begin
  if v_a is null or not public.uzu_can(v_a, 'academy_settings', 'update') then raise exception 'Action non autorisée : droit « Paramètres de l''académie » requis'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Données invalides'; end if;
  select * into c from public.clubs where id = v_a;
  if not exists (select 1 from public.geo_communes where insee = p->>'insee') then raise exception 'Choisis la commune de la salle'; end if;
  if jsonb_typeof(coalesce(p->'disciplines', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p->'disciplines', '[]'::jsonb)) = 0 then
    raise exception 'Choisis au moins une discipline';
  end if;
  -- Conditions d'accueil : seules les clés connues, textes courts
  if jsonb_typeof(p->'welcome') = 'object' then
    w := jsonb_strip_nulls(jsonb_build_object(
      'price', nullif(left(btrim(coalesce(p->'welcome'->>'price', '')), 60), ''),
      'license', nullif(left(btrim(coalesce(p->'welcome'->>'license', '')), 120), ''),
      'rules', nullif(left(btrim(coalesce(p->'welcome'->>'rules', '')), 200), ''),
      'contact_first', case when (p->'welcome'->>'contact_first') in ('true','false') then (p->'welcome'->>'contact_first')::boolean end,
      'notes', nullif(left(btrim(coalesce(p->'welcome'->>'notes', '')), 300), '')));
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
    welcome = w,
    status = case when coalesce((p->>'published')::boolean, false) then 'published' else 'hidden' end,
    verified_at = now(), updated_at = now()
  where id = d.id;
  -- Créneaux ouverts : uniquement des créneaux existants du planning du club
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
    jsonb_build_object('published', coalesce((p->>'published')::boolean, false), 'slots', n));
  return jsonb_build_object('ok', true, 'slug', d.slug, 'slots', n);
end $$;

-- -----------------------------------------------------------------------------------------
-- 5. Propositions des pratiquants et administration UZU
-- -----------------------------------------------------------------------------------------
create or replace function public.dir_suggest(p_slug text, p jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_d uuid; v jsonb;
begin
  if (select count(*) from public.dir_suggestions where user_id = v_uid and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Trop de propositions aujourd''hui : réessaie demain';
  end if;
  if p_slug is not null then
    select id into v_d from public.dir_clubs where slug = p_slug and status = 'published';
    if v_d is null then raise exception 'Fiche introuvable'; end if;
  end if;
  v := jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(left(btrim(coalesce(p->>'name', '')), 80), ''), 'commune', nullif(left(btrim(coalesce(p->>'commune', '')), 80), ''),
    'details', nullif(left(btrim(coalesce(p->>'details', '')), 800), ''), 'contact', nullif(left(btrim(coalesce(p->>'contact', '')), 120), '')));
  if coalesce(v->>'details', v->>'name', '') = '' then raise exception 'Décris le club ou la correction'; end if;
  insert into public.dir_suggestions (user_id, dir_club_id, payload) values (v_uid, v_d, v);
  return true;
end $$;

-- Équipe UZU : créer ou mettre à jour une fiche référencée et ses créneaux (p : slug?, name, insee, address,
-- disciplines[], description, website, instagram, phone, email, welcome, status, sessions[{d,s,e,disc,kind,price,notes}])
create or replace function public.dir_admin_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); d public.dir_clubs; v_slug text; s jsonb;
begin
  if not public.uzu_platform_admin() then raise exception 'Action réservée à l''équipe UZU'; end if;
  if not exists (select 1 from public.geo_communes where insee = p->>'insee') then raise exception 'Commune inconnue'; end if;
  if p->>'slug' is not null then select * into d from public.dir_clubs where slug = p->>'slug' for update; end if;
  if d.id is not null and d.club_id is not null then raise exception 'Fiche d''un club client : modifiable par le club seulement'; end if;
  if d.id is null then
    v_slug := left(public.dir_slugify(btrim(p->>'name') || '-' || (select nom from public.geo_communes where insee = p->>'insee')), 80);
    if exists (select 1 from public.dir_clubs where slug = v_slug) then v_slug := left(v_slug, 80) || '-' || left(md5(random()::text), 5); end if;
    insert into public.dir_clubs (slug, name, insee, origin, created_by) values (v_slug, btrim(p->>'name'), p->>'insee', 'uzu_staff', v_uid) returning * into d;
  end if;
  update public.dir_clubs set name = btrim(p->>'name'), insee = p->>'insee', address = btrim(coalesce(p->>'address', '')),
    disciplines = array(select distinct x from jsonb_array_elements_text(coalesce(p->'disciplines', '[]'::jsonb)) x where x in ('jjb_gi','grappling_nogi')),
    description = btrim(coalesce(p->>'description', '')), website = btrim(coalesce(p->>'website', '')),
    instagram = ltrim(btrim(coalesce(p->>'instagram', '')), '@'), phone = btrim(coalesce(p->>'phone', '')), email = lower(btrim(coalesce(p->>'email', ''))),
    welcome = case when jsonb_typeof(p->'welcome') = 'object' then p->'welcome' else '{}'::jsonb end,
    status = case when p->>'status' in ('draft','published','hidden') then p->>'status' else 'draft' end,
    verified_at = now(), updated_at = now()
  where id = d.id;
  if jsonb_typeof(p->'sessions') = 'array' then
    delete from public.dir_sessions where dir_club_id = d.id;
    for s in select * from jsonb_array_elements(p->'sessions') loop
      insert into public.dir_sessions (dir_club_id, weekday, start_t, end_t, discipline, kind, price, notes)
      values (d.id, (s->>'d')::int, s->>'s', s->>'e', public.dir_disc(s->>'disc'), s->>'kind', coalesce(s->>'price', ''), coalesce(s->>'notes', ''));
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'slug', d.slug);
end $$;

create or replace function public.dir_admin_suggestions() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.uzu_platform_admin() then raise exception 'Action réservée à l''équipe UZU'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'club', d.name, 'slug', d.slug, 'payload', s.payload, 'status', s.status, 'at', s.created_at) order by s.created_at desc)
                     from (select * from public.dir_suggestions order by created_at desc limit 200) s left join public.dir_clubs d on d.id = s.dir_club_id), '[]'::jsonb);
end $$;

create or replace function public.dir_admin_resolve(p_id uuid, p_status text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.uzu_platform_admin() then raise exception 'Action réservée à l''équipe UZU'; end if;
  if p_status not in ('accepted','rejected','open') then raise exception 'État inconnu'; end if;
  update public.dir_suggestions set status = p_status, resolved_at = case when p_status = 'open' then null else now() end,
         resolved_by = case when p_status = 'open' then null else auth.uid() end where id = p_id;
  return found;
end $$;

-- -----------------------------------------------------------------------------------------
-- 6. Droits d'exécution : personnes connectées seulement ; outils internes non appelables
-- -----------------------------------------------------------------------------------------
revoke all on function public.uzu_platform_admin() from public, anon;
revoke all on function public.dir_club_sessions(uuid) from public, anon, authenticated;
revoke all on function public.dir_search(text, int, text, text, int) from public, anon;
revoke all on function public.dir_get(text) from public, anon;
revoke all on function public.dir_my_club() from public, anon;
revoke all on function public.dir_my_club_save(jsonb) from public, anon;
revoke all on function public.dir_suggest(text, jsonb) from public, anon;
revoke all on function public.dir_admin_save(jsonb) from public, anon;
revoke all on function public.dir_admin_suggestions() from public, anon;
revoke all on function public.dir_admin_resolve(uuid, text) from public, anon;
grant execute on function public.uzu_platform_admin() to authenticated;
grant execute on function public.dir_search(text, int, text, text, int) to authenticated;
grant execute on function public.dir_get(text) to authenticated;
grant execute on function public.dir_my_club() to authenticated;
grant execute on function public.dir_my_club_save(jsonb) to authenticated;
grant execute on function public.dir_suggest(text, jsonb) to authenticated;
grant execute on function public.dir_admin_save(jsonb) to authenticated;
grant execute on function public.dir_admin_suggestions() to authenticated;
grant execute on function public.dir_admin_resolve(uuid, text) to authenticated;

commit;

-- Contrôle : 4 tables fermées au navigateur, aucune fonction de l'annuaire pour anon
select (select count(*) from pg_tables where schemaname = 'public' and tablename in ('dir_clubs','dir_sessions','dir_club_slots','dir_suggestions')) as tables_ajoutees,
       (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name like 'dir\_%' and grantee in ('anon','authenticated')) as droits_directs,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'dir\_%' and has_function_privilege('anon', p.oid, 'execute')
           and p.proname not in ('dir_disc','dir_slugify','dir_band')) as fonctions_pour_anon;
