-- =========================================================================================
-- UZU — « OÙ ROULER ? » ÉTAPE 2 : CRÉNEAUX ET PARTENAIRES DE ROULAGE (révision « court terme »)
--   • Profil de roulage (créé seulement à l'activation : majorité déclarée, accord, sécurité),
--     invisible par défaut ; visibilité « mes clubs » ou « tout UZU », avec réciprocité.
--   • Créneaux précis : début et fin à la minute (heure universelle) + fuseau du lieu de roulage.
--     Raccourcis Maintenant, Dans 30 min, 1 h, 2 h, 4 h calculés à l'heure du serveur ; autre moment
--     saisi à l'heure locale de la commune. Durée 1 h, 1 h 30, 2 h, 3 h (prolongeable jusqu'à 4 h).
--     3 créneaux en cours ou à venir au plus. La ville habituelle n'est jamais modifiée par un déplacement.
--   • Recherche par chevauchement réel : le temps en commun doit atteindre la durée choisie
--     (30 min, 1 h, 1 h 30, 2 h) ; « Mon créneau » : au moins cette durée dans mon créneau.
--     Un créneau sort des résultats dès son heure de fin. Aucun identifiant de compte renvoyé.
--   • Blocage (table existante user_blocks), signalement au référent UZU, pause automatique.
--   • Ménage par la tâche planifiée rouler-expire (toutes les 15 min, si pg_cron est présent).
-- Décisions D1 à D10 validées le 20/11/2026 ; révision C1 à C7 validée le 20/11/2026 (« feu vert »).
-- Prérequis : uzu-14a0, uzu-14a, uzu-14a2. Ajout seul : aucune table, colonne, donnée ou règle
-- existante n'est modifiée. Toutes les tables s'effacent en cascade avec le compte. Rejouable.
-- Base qui porte l'ancienne version (dates, jours, moments) : exécuter d'abord la bascule.
-- =========================================================================================
begin;

do $$ begin
  if to_regclass('public.dir_moderators') is null then raise exception 'Prérequis absent : applique uzu-14a2 d''abord'; end if;
  if to_regclass('public.lib_disciplines') is null then raise exception 'Référentiel des disciplines (Bibliothèque) absent'; end if;
  if to_regclass('public.rouler_availabilities') is not null and not exists (select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'rouler_availabilities' and column_name = 'starts_at') then
    raise exception 'Ancienne version des disponibilités : exécute d''abord db/ou-rouler/bascule-creneaux-base-test.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------------------
-- 1. Tables (fermées au navigateur)
-- -----------------------------------------------------------------------------------------
create table if not exists public.rouler_profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  status         text not null default 'active' check (status in ('active','paused')),
  visibility     text not null default 'hidden' check (visibility in ('hidden','clubs','uzu')),
  home_insee     text not null references public.geo_communes (insee),
  disciplines    text[] not null default '{}',
  intensities    text[] not null default '{}' check (intensities <@ array['technique','modere','intense']::text[]),
  show_belt      boolean not null default false,
  show_club_id   uuid references public.clubs (id) on delete set null,
  years          smallint check (years is null or years between 0 and 60),
  adult_declared_at timestamptz not null,
  consent_at     timestamptz not null,
  safety_ack_at  timestamptz not null,
  paused_at      timestamptz,
  last_active_at timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.rouler_availabilities (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.rouler_profiles (user_id) on delete cascade,
  insee        text not null references public.geo_communes (insee),
  tz           text not null,
  is_travel    boolean not null default false,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  disciplines  text[] not null,
  intensities  text[] not null check (cardinality(intensities) >= 1 and intensities <@ array['technique','modere','intense']::text[]),
  places       text[] not null check (cardinality(places) >= 1 and places <@ array['club','open_mat','a_convenir']::text[]),
  note         text not null default '' check (length(note) <= 140),
  status       text not null default 'active' check (status in ('active','ended','expired')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '4 hours')
);
create index if not exists rouler_av_active_idx on public.rouler_availabilities (insee, ends_at) where status = 'active';
create index if not exists rouler_av_user_idx on public.rouler_availabilities (user_id);


create table if not exists public.rouler_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references auth.users (id) on delete set null,
  target_id       uuid not null references auth.users (id) on delete cascade,
  availability_id uuid,
  reason          text not null check (reason in ('inapproprie','harcelement','faux','mineur','autre')),
  details         text not null default '' check (length(details) <= 500),
  status          text not null default 'open' check (status in ('open','kept','restored','dismissed')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users (id) on delete set null
);
create index if not exists rouler_reports_target_idx on public.rouler_reports (target_id, created_at desc);

create table if not exists public.rouler_search_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists rouler_search_log_idx on public.rouler_search_log (user_id, at desc);

alter table public.rouler_profiles enable row level security;
alter table public.rouler_availabilities enable row level security;
alter table public.rouler_reports enable row level security;
alter table public.rouler_search_log enable row level security;
revoke all on public.rouler_profiles, public.rouler_availabilities, public.rouler_reports, public.rouler_search_log from anon, authenticated;

-- -----------------------------------------------------------------------------------------
-- 2. Outils internes (non appelables depuis le navigateur)
-- -----------------------------------------------------------------------------------------
-- « Prénom I. » (même règle que l'application, sans dépendre d'un autre lot)
create or replace function public.rouler_name(p_uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when coalesce(btrim(n), '') = '' then 'Pratiquant'
              when split_part(btrim(n), ' ', 2) = '' then split_part(btrim(n), ' ', 1)
              else split_part(btrim(n), ' ', 1) || ' ' || upper(left(split_part(btrim(n), ' ', 2), 1)) || '.' end
    from (select coalesce(nullif((select display_name from public.profiles where user_id = p_uid), ''),
                          (select raw_user_meta_data->>'name' from auth.users where id = p_uid)) as n) x
$$;

create or replace function public.rouler_belt_rank(p text) returns int language sql immutable as $$
  select case p when 'blanche' then 1 when 'bleue' then 2 when 'violette' then 3 when 'marron' then 4 when 'noire' then 5 end
$$;

create or replace function public.rouler_belt(p_uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select data->>'rank' from public.docs where path = 'grades/' || p_uid::text and public.rouler_belt_rank(data->>'rank') is not null
$$;

-- Membre actif d'un groupe de mineurs
create or replace function public.rouler_is_minor(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.academy_members m join public.academy_sections s on s.id = m.section_id
                  where m.user_id = p_uid and m.status = 'active' and s.minors)
$$;

create or replace function public.rouler_share_club(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.academy_members a join public.academy_members b on b.academy_id = a.academy_id
                  where a.user_id = p_a and b.user_id = p_b and a.status = 'active' and b.status = 'active')
$$;

create or replace function public.rouler_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_blocks
                  where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a))
$$;

-- Disciplines acceptées : celles ouvertes dans la Bibliothèque (MMA s'y ajoutera sans changer ce schéma)
create or replace function public.rouler_disc_ok(p text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select cardinality(coalesce(p, '{}')) >= 1
     and not exists (select 1 from unnest(p) x where x not in (select id from public.lib_disciplines where active))
$$;

create or replace function public.rouler_text_array(p jsonb) returns text[] language sql immutable as $$
  select case when jsonb_typeof(p) = 'array' then array(select distinct x from jsonb_array_elements_text(p) x) else '{}'::text[] end
$$;


-- Fuseau du lieu de roulage, déduit de la commune (jamais de l'appareil). Outre-mer compris.
create or replace function public.rouler_tz(p_insee text) returns text
language sql stable security definer set search_path = public as $$
  select case (select departement from public.geo_communes where insee = p_insee)
    when '971' then 'America/Guadeloupe' when '972' then 'America/Martinique' when '973' then 'America/Cayenne'
    when '974' then 'Indian/Reunion' when '975' then 'America/Miquelon' when '976' then 'Indian/Mayotte'
    else 'Europe/Paris' end
$$;

-- Date et heure locales du lieu → instant universel. Heure inexistante (passage à l'heure d'été) refusée ;
-- heure doublée (retour à l'heure d'hiver) : la première des deux.
create or replace function public.rouler_local_ts(p_date text, p_time text, p_tz text) returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare t timestamp; z timestamptz;
begin
  if coalesce(p_date, '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_time, '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Date ou heure invalide'; end if;
  begin t := (p_date || ' ' || p_time)::timestamp; exception when others then raise exception 'Date ou heure invalide'; end;
  z := t at time zone p_tz;
  if (z at time zone p_tz) <> t then raise exception 'Cette heure n''existe pas ce jour-là (changement d''heure) : choisis-en une autre'; end if;
  if ((z - interval '1 hour') at time zone p_tz) = t then z := z - interval '1 hour'; end if;
  return z;
end $$;

-- Créneaux compatibles avec une fenêtre [p_w0, p_w1] : temps en commun ≥ p_req, règles de visibilité appliquées.
create or replace function public.rouler_matches(p_viewer uuid, p_vis text, p_lat double precision, p_lon double precision, p_r int,
  p_w0 timestamptz, p_w1 timestamptz, p_req interval, p_disc text default null, p_int text default null, p_bmin int default null, p_bmax int default null)
returns table (dist double precision, common_min int, item jsonb)
language sql stable security definer set search_path = public as $$
  with c as (
    select a.id as aid, a.user_id as uid, a.tz, a.is_travel, a.starts_at, a.ends_at, a.disciplines, a.intensities, a.places, a.note,
           p.show_belt, p.show_club_id, p.years, p.visibility as pvis, g.nom as commune, g.departement as dep,
           6371 * 2 * asin(sqrt(power(sin(radians(g.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(g.lat)) * power(sin(radians(g.lon - p_lon) / 2), 2))) as d,
           greatest(a.starts_at, p_w0) as cs, least(a.ends_at, p_w1) as ce
      from public.rouler_availabilities a
      join public.rouler_profiles p on p.user_id = a.user_id
      join public.geo_communes g on g.insee = a.insee
     where a.status = 'active' and a.ends_at > now() and a.starts_at < p_w1 and a.ends_at > p_w0
       and p.status = 'active' and p.visibility <> 'hidden' and p.user_id <> p_viewer
       and g.lat between p_lat - p_r / 111.0 and p_lat + p_r / 111.0
       and g.lon between p_lon - p_r / (111.0 * greatest(cos(radians(p_lat)), 0.2)) and p_lon + p_r / (111.0 * greatest(cos(radians(p_lat)), 0.2))
       and (p_disc is null or p_disc = any (a.disciplines))
       and (p_int is null or p_int = any (a.intensities))
  ), f as (
    select c.*, case when c.show_belt then public.rouler_belt(c.uid) end as belt
      from c
     where c.d <= p_r and c.ce - c.cs >= p_req
       and not public.rouler_blocked(p_viewer, c.uid)
       and not public.rouler_is_minor(c.uid)
       and (public.rouler_share_club(p_viewer, c.uid) or (c.pvis = 'uzu' and p_vis = 'uzu'))
  )
  select f.d, (extract(epoch from (f.ce - f.cs)) / 60)::int,
         jsonb_build_object('handle', f.aid, 'name', public.rouler_name(f.uid), 'belt', f.belt, 'years', f.years,
           'club', case when f.show_club_id is not null and exists (select 1 from public.academy_members m where m.user_id = f.uid and m.academy_id = f.show_club_id and m.status = 'active')
                        then (select name from public.clubs where id = f.show_club_id) end,
           'commune', f.commune, 'dep', f.dep, 'band', public.dir_band(f.d::numeric), 'tz', f.tz, 'is_travel', f.is_travel,
           'starts_at', f.starts_at, 'ends_at', f.ends_at, 'common_start', f.cs, 'common_end', f.ce,
           'common_minutes', (extract(epoch from (f.ce - f.cs)) / 60)::int,
           'disciplines', to_jsonb(f.disciplines), 'intensities', to_jsonb(f.intensities), 'places', to_jsonb(f.places), 'note', f.note)
    from f
   where (p_bmin is null and p_bmax is null)
      or (f.belt is not null and public.rouler_belt_rank(f.belt) between coalesce(p_bmin, 1) and coalesce(p_bmax, 5))
$$;

-- -----------------------------------------------------------------------------------------
-- 3. Mon profil de roulage
-- -----------------------------------------------------------------------------------------
create or replace function public.rouler_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); p public.rouler_profiles;
begin
  select * into p from public.rouler_profiles where user_id = v_uid;
  return jsonb_build_object(
    'now', now(),
    'minor', public.rouler_is_minor(v_uid),
    'name', public.rouler_name(v_uid),
    'belt', public.rouler_belt(v_uid),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
                         from public.academy_members m join public.clubs c on c.id = m.academy_id
                        where m.user_id = v_uid and m.status = 'active'), '[]'::jsonb),
    'profile', case when p.user_id is null then null else jsonb_build_object(
        'status', p.status, 'visibility', p.visibility, 'home_insee', p.home_insee,
        'home_commune', (select nom || ' (' || departement || ')' from public.geo_communes where insee = p.home_insee),
        'home_tz', public.rouler_tz(p.home_insee),
        'disciplines', to_jsonb(p.disciplines), 'intensities', to_jsonb(p.intensities),
        'show_belt', p.show_belt, 'show_club_id', p.show_club_id, 'years', p.years,
        'adult_declared_at', p.adult_declared_at) end,
    'availabilities', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'insee', a.insee,
        'commune', g.nom || ' (' || g.departement || ')', 'tz', a.tz, 'is_travel', a.is_travel,
        'starts_at', a.starts_at, 'ends_at', a.ends_at, 'minutes', (extract(epoch from (a.ends_at - a.starts_at)) / 60)::int,
        'disciplines', to_jsonb(a.disciplines), 'intensities', to_jsonb(a.intensities), 'places', to_jsonb(a.places), 'note', a.note,
        'state', case when a.starts_at > now() then 'upcoming' else 'current' end,
        'compatible', case when p.status = 'active' and p.visibility <> 'hidden' and not public.rouler_is_minor(v_uid) then
           (select count(distinct m.item->>'name') from public.rouler_matches(v_uid, p.visibility, g.lat, g.lon, 25, greatest(a.starts_at, now()), a.ends_at,
              least(interval '1 hour', a.ends_at - greatest(a.starts_at, now()))) m) else 0 end) order by a.starts_at)
      from public.rouler_availabilities a join public.geo_communes g on g.insee = a.insee
     where a.user_id = v_uid and a.status = 'active' and a.ends_at > now()), '[]'::jsonb));
end $$;

create or replace function public.rouler_check_profile(v_uid uuid, p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_disc text[] := public.rouler_text_array(p->'disciplines'); v_int text[] := public.rouler_text_array(p->'intensities');
  v_club uuid; v_years int; v_vis text := coalesce(p->>'visibility', 'hidden');
begin
  if not exists (select 1 from public.geo_communes where insee = p->>'home_insee') then raise exception 'Choisis ta ville habituelle'; end if;
  if not public.rouler_disc_ok(v_disc) then raise exception 'Choisis au moins une discipline'; end if;
  if cardinality(v_int) = 0 or not v_int <@ array['technique','modere','intense'] then raise exception 'Choisis au moins un type de roulage'; end if;
  if v_vis not in ('hidden','clubs','uzu') then raise exception 'Visibilité inconnue'; end if;
  if nullif(p->>'show_club_id', '') is not null then
    v_club := (p->>'show_club_id')::uuid;
    if not exists (select 1 from public.academy_members where user_id = v_uid and academy_id = v_club and status = 'active') then
      raise exception 'Club affiché : choisis un de tes clubs';
    end if;
  end if;
  if nullif(p->>'years', '') is not null then
    v_years := (p->>'years')::int;
    if v_years < 0 or v_years > 60 then raise exception 'Années de pratique : entre 0 et 60'; end if;
  end if;
  return jsonb_build_object('disciplines', to_jsonb(v_disc), 'intensities', to_jsonb(v_int), 'visibility', v_vis,
    'show_club_id', v_club, 'years', v_years, 'show_belt', coalesce((p->>'show_belt')::boolean, false));
end $$;

create or replace function public.rouler_activate(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); c jsonb;
begin
  if jsonb_typeof(p) <> 'object' then raise exception 'Données invalides'; end if;
  if coalesce((p->>'adult')::boolean, false) is not true then raise exception 'Réservé aux pratiquants majeurs : coche « J''ai 18 ans ou plus »'; end if;
  if coalesce((p->>'consent')::boolean, false) is not true then raise exception 'Ton accord sur ce qui est montré est nécessaire'; end if;
  if coalesce((p->>'safety')::boolean, false) is not true then raise exception 'Lis et coche les conseils de sécurité'; end if;
  if public.rouler_is_minor(v_uid) then raise exception 'Activation impossible : tu fais partie d''un groupe de mineurs dans ton club'; end if;
  c := public.rouler_check_profile(v_uid, p);
  insert into public.rouler_profiles (user_id, visibility, home_insee, disciplines, intensities, show_belt, show_club_id, years,
                                      adult_declared_at, consent_at, safety_ack_at)
  values (v_uid, c->>'visibility', p->>'home_insee', public.rouler_text_array(c->'disciplines'), public.rouler_text_array(c->'intensities'),
          (c->>'show_belt')::boolean, (c->>'show_club_id')::uuid, (c->>'years')::smallint, now(), now(), now())
  on conflict (user_id) do update set visibility = excluded.visibility, home_insee = excluded.home_insee, disciplines = excluded.disciplines,
    intensities = excluded.intensities, show_belt = excluded.show_belt, show_club_id = excluded.show_club_id, years = excluded.years,
    adult_declared_at = now(), consent_at = now(), safety_ack_at = now(), last_active_at = now(), updated_at = now();
  return public.rouler_me();
end $$;

create or replace function public.rouler_save_profile(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); c jsonb;
begin
  if not exists (select 1 from public.rouler_profiles where user_id = v_uid) then raise exception 'Active d''abord ton profil de roulage'; end if;
  c := public.rouler_check_profile(v_uid, p);
  update public.rouler_profiles set visibility = c->>'visibility', home_insee = p->>'home_insee',
    disciplines = public.rouler_text_array(c->'disciplines'), intensities = public.rouler_text_array(c->'intensities'),
    show_belt = (c->>'show_belt')::boolean, show_club_id = (c->>'show_club_id')::uuid, years = (c->>'years')::smallint,
    last_active_at = now(), updated_at = now()
  where user_id = v_uid;
  -- Les disponibilités « dans ma ville » suivent la ville habituelle
  update public.rouler_availabilities set insee = p->>'home_insee', tz = public.rouler_tz(p->>'home_insee'), updated_at = now()
   where user_id = v_uid and not is_travel and status = 'active' and ends_at > now();
  return public.rouler_me();
end $$;

create or replace function public.rouler_set_visibility(p_visibility text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth();
begin
  if p_visibility not in ('hidden','clubs','uzu') then raise exception 'Visibilité inconnue'; end if;
  update public.rouler_profiles set visibility = p_visibility, last_active_at = now(), updated_at = now() where user_id = v_uid;
  if not found then raise exception 'Active d''abord ton profil de roulage'; end if;
  return public.rouler_me();
end $$;

create or replace function public.rouler_delete_profile() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth();
begin
  delete from public.rouler_profiles where user_id = v_uid;   -- les disponibilités suivent en cascade
  delete from public.rouler_search_log where user_id = v_uid;
  return true;
end $$;

-- -----------------------------------------------------------------------------------------
-- 4. Créneaux
-- -----------------------------------------------------------------------------------------
-- p : id (modification), is_travel, insee (si déplacement), when (now | 30 | 60 | 120 | 240 | custom),
--     date et time (heure locale du lieu, si custom), minutes (60 | 90 | 120 | 180), disciplines, intensities, places, note
create or replace function public.rouler_save_availability(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); pr public.rouler_profiles; v_id uuid := nullif(p->>'id', '')::uuid;
  v_travel boolean := coalesce((p->>'is_travel')::boolean, false); v_insee text; v_tz text; v_when text := coalesce(p->>'when', 'now');
  v_min int; v_start timestamptz; v_end timestamptz; v_now timestamptz := date_trunc('minute', now());
  v_disc text[] := public.rouler_text_array(p->'disciplines'); v_int text[] := public.rouler_text_array(p->'intensities');
  v_places text[] := public.rouler_text_array(p->'places'); v_note text := btrim(coalesce(p->>'note', ''));
begin
  select * into pr from public.rouler_profiles where user_id = v_uid;
  if pr.user_id is null then raise exception 'Active d''abord ton profil de roulage'; end if;
  if public.rouler_is_minor(v_uid) then raise exception 'Fonction indisponible pour les membres d''un groupe de mineurs'; end if;
  v_insee := case when v_travel then p->>'insee' else pr.home_insee end;
  if not exists (select 1 from public.geo_communes where insee = v_insee) then raise exception 'Choisis la commune où tu veux rouler'; end if;
  v_tz := public.rouler_tz(v_insee);
  begin v_min := (p->>'minutes')::int; exception when others then v_min := null; end;
  if v_min is null or v_min not in (60, 90, 120, 180) then raise exception 'Durée : 1 h, 1 h 30, 2 h ou 3 h'; end if;
  if v_when in ('now', '30', '60', '120', '240') then
    v_start := v_now + make_interval(mins => case v_when when 'now' then 0 else v_when::int end);
  elsif v_when = 'custom' then
    v_start := public.rouler_local_ts(p->>'date', p->>'time', v_tz);
    if extract(minute from (v_start at time zone v_tz))::int % 15 <> 0 then raise exception 'Heure de début : par quart d''heure'; end if;
    if v_start < v_now then raise exception 'Le créneau ne peut pas commencer dans le passé'; end if;
    if v_start > now() + interval '30 days' then raise exception 'Début dans les 30 prochains jours au plus'; end if;
  else
    raise exception 'Moment inconnu';
  end if;
  v_end := v_start + make_interval(mins => v_min);
  if not public.rouler_disc_ok(v_disc) then raise exception 'Choisis au moins une discipline'; end if;
  if cardinality(v_int) = 0 or not v_int <@ array['technique','modere','intense'] then raise exception 'Choisis au moins un type de roulage'; end if;
  if cardinality(v_places) = 0 or not v_places <@ array['club','open_mat','a_convenir'] then raise exception 'Choisis au moins un lieu'; end if;
  if length(v_note) > 140 then raise exception 'Le mot fait 140 caractères au plus'; end if;
  if exists (select 1 from public.rouler_availabilities where user_id = v_uid and status = 'active' and ends_at > now()
              and id is distinct from v_id and starts_at < v_end and ends_at > v_start) then
    raise exception 'Tu as déjà un créneau sur cet horaire';
  end if;
  if v_id is null then
    if (select count(*) from public.rouler_availabilities where user_id = v_uid and status = 'active' and ends_at > now()) >= 3 then
      raise exception '3 créneaux en cours ou à venir au plus : arrête-en un d''abord';
    end if;
    insert into public.rouler_availabilities (user_id, insee, tz, is_travel, starts_at, ends_at, disciplines, intensities, places, note)
    values (v_uid, v_insee, v_tz, v_travel, v_start, v_end, v_disc, v_int, v_places, v_note);
  else
    update public.rouler_availabilities set insee = v_insee, tz = v_tz, is_travel = v_travel, starts_at = v_start, ends_at = v_end,
      disciplines = v_disc, intensities = v_int, places = v_places, note = v_note, updated_at = now()
     where id = v_id and user_id = v_uid and status = 'active' and ends_at > now();
    if not found then raise exception 'Créneau introuvable'; end if;
  end if;
  update public.rouler_profiles set last_active_at = now() where user_id = v_uid;
  return public.rouler_me();
end $$;

create or replace function public.rouler_end_availability(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth();
begin
  update public.rouler_availabilities set status = 'ended', updated_at = now() where id = p_id and user_id = v_uid and status = 'active';
  if not found then raise exception 'Créneau introuvable'; end if;
  return public.rouler_me();
end $$;

-- Prolonger de 30 min un créneau en cours ou à venir (4 h au plus au total)
create or replace function public.rouler_extend_availability(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); a public.rouler_availabilities;
begin
  select * into a from public.rouler_availabilities where id = p_id and user_id = v_uid and status = 'active' and ends_at > now();
  if a.id is null then raise exception 'Créneau introuvable'; end if;
  if a.ends_at + interval '30 minutes' - a.starts_at > interval '4 hours' then raise exception 'Un créneau dure 4 h au plus'; end if;
  if exists (select 1 from public.rouler_availabilities where user_id = v_uid and status = 'active' and id <> a.id
              and starts_at < a.ends_at + interval '30 minutes' and ends_at > a.ends_at) then
    raise exception 'Tu as déjà un créneau juste après';
  end if;
  update public.rouler_availabilities set ends_at = ends_at + interval '30 minutes', updated_at = now() where id = a.id;
  return public.rouler_me();
end $$;

-- -----------------------------------------------------------------------------------------
-- 5. Recherche de partenaires (règles « qui voit qui » et chevauchement appliqués ici)
-- -----------------------------------------------------------------------------------------
-- p : insee (commune de recherche ; par défaut celle de mon créneau en mode slot), radius (5 à 100 km),
--     when (now | 30 | 60 | 120 | 240 | custom | slot), date et time (si custom, heure locale de la commune),
--     slot (identifiant de mon créneau, si slot), minutes (temps commun minimum : 30 | 60 | 90 | 120),
--     disc, intensity, belt_min, belt_max
create or replace function public.rouler_search(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); me public.rouler_profiles; o public.geo_communes; s public.rouler_availabilities;
  v_when text := coalesce(p->>'when', 'now'); v_min int; v_r int; v_w0 timestamptz; v_w1 timestamptz; v_req interval;
  v_now timestamptz := date_trunc('minute', now()); v_insee text := nullif(p->>'insee', '');
  v_disc text := nullif(p->>'disc', ''); v_int text := nullif(p->>'intensity', '');
  bmin int := public.rouler_belt_rank(nullif(p->>'belt_min', '')); bmax int := public.rouler_belt_rank(nullif(p->>'belt_max', '')); v jsonb;
begin
  select * into me from public.rouler_profiles where user_id = v_uid;
  if me.user_id is null then return jsonb_build_object('need', 'activate'); end if;
  if public.rouler_is_minor(v_uid) then return jsonb_build_object('need', 'adult'); end if;
  if me.status = 'paused' then return jsonb_build_object('need', 'paused'); end if;
  if me.visibility = 'hidden' then return jsonb_build_object('need', 'visible'); end if;
  begin v_min := coalesce((p->>'minutes')::int, 60); exception when others then v_min := null; end;
  if v_min is null or v_min not in (30, 60, 90, 120) then raise exception 'Temps commun : 30 min, 1 h, 1 h 30 ou 2 h'; end if;
  begin v_r := least(greatest(coalesce((p->>'radius')::int, 25), 5), 100); exception when others then v_r := 25; end;
  if v_when = 'slot' then
    begin select * into s from public.rouler_availabilities where id = (p->>'slot')::uuid and user_id = v_uid and status = 'active' and ends_at > now();
    exception when others then s := null; end;
    if s.id is null then raise exception 'Créneau introuvable ou terminé'; end if;
    v_insee := coalesce(v_insee, s.insee);
  end if;
  select * into o from public.geo_communes where insee = v_insee;
  if o.insee is null then raise exception 'Commune inconnue'; end if;
  if v_disc is not null and not public.rouler_disc_ok(array[v_disc]) then raise exception 'Discipline inconnue'; end if;
  if v_int is not null and v_int not in ('technique','modere','intense') then raise exception 'Type de roulage inconnu'; end if;
  if (nullif(p->>'belt_min', '') is not null and bmin is null) or (nullif(p->>'belt_max', '') is not null and bmax is null) then raise exception 'Ceinture inconnue'; end if;
  if v_when = 'now' then v_w0 := now();
  elsif v_when in ('30', '60', '120', '240') then v_w0 := v_now + make_interval(mins => v_when::int);
  elsif v_when = 'custom' then
    v_w0 := public.rouler_local_ts(p->>'date', p->>'time', public.rouler_tz(o.insee));
    if v_w0 < v_now - interval '1 minute' then v_w0 := now(); end if;
    if v_w0 > now() + interval '31 days' then raise exception 'Recherche dans les 30 prochains jours au plus'; end if;
  elsif v_when = 'slot' then v_w0 := greatest(s.starts_at, now());
  else raise exception 'Moment inconnu';
  end if;
  if v_when = 'slot' then
    v_w1 := s.ends_at; v_req := least(make_interval(mins => v_min), v_w1 - v_w0);
  else
    v_w1 := v_w0 + make_interval(mins => v_min); v_req := make_interval(mins => v_min);
  end if;
  if (select count(*) from public.rouler_search_log where user_id = v_uid and at > now() - interval '1 hour') >= 30 then
    raise exception 'Trop de recherches en une heure : réessaie un peu plus tard';
  end if;
  insert into public.rouler_search_log (user_id) values (v_uid);
  select coalesce(jsonb_agg(z.item order by z.dist, z.common_min desc), '[]'::jsonb) into v
    from (select * from public.rouler_matches(v_uid, me.visibility, o.lat, o.lon, v_r, v_w0, v_w1, v_req, v_disc, v_int, bmin, bmax)
           order by dist, common_min desc limit 50) z;
  return jsonb_build_object('commune', jsonb_build_object('insee', o.insee, 'nom', o.nom, 'dep', o.departement, 'tz', public.rouler_tz(o.insee)),
    'radius', v_r, 'when', v_when, 'minutes', v_min, 'required_minutes', (extract(epoch from v_req) / 60)::int,
    'window', jsonb_build_object('start', v_w0, 'end', v_w1, 'tz', public.rouler_tz(o.insee)), 'now', now(), 'results', v);
end $$;

drop function if exists public.rouler_search(text, int, date, date, text, text, text, text);

-- -----------------------------------------------------------------------------------------
-- 6. Blocage et signalement (à partir d'une disponibilité : aucun identifiant de compte exposé)
-- -----------------------------------------------------------------------------------------
create or replace function public.rouler_block(p_handle uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_target uuid;
begin
  select user_id into v_target from public.rouler_availabilities where id = p_handle;
  if v_target is null or v_target = v_uid then raise exception 'Action impossible'; end if;
  if (select count(*) from public.user_blocks where blocker_id = v_uid) >= 200 then raise exception 'Trop de membres masqués'; end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (v_uid, v_target) on conflict do nothing;
  return true;
end $$;

-- Personnes que je ne vois plus : prénom et initiale, clé opaque (jamais l'identifiant du compte)
create or replace function public.rouler_my_blocks() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', md5(b.blocker_id::text || b.blocked_id::text), 'name', public.rouler_name(b.blocked_id), 'at', b.created_at)
           order by b.created_at desc), '[]'::jsonb)
    from public.user_blocks b where b.blocker_id = public.uzu_require_auth()
$$;

create or replace function public.rouler_unblock(p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth();
begin
  delete from public.user_blocks where blocker_id = v_uid and md5(blocker_id::text || blocked_id::text) = p_key;
  if not found then raise exception 'Introuvable'; end if;
  return true;
end $$;

create or replace function public.rouler_report(p_handle uuid, p_reason text, p_details text default '') returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_target uuid; n int;
begin
  select user_id into v_target from public.rouler_availabilities where id = p_handle;
  if v_target is null or v_target = v_uid then raise exception 'Signalement impossible'; end if;
  if p_reason not in ('inapproprie','harcelement','faux','mineur','autre') then raise exception 'Motif invalide'; end if;
  if (select count(*) from public.rouler_reports where reporter_id = v_uid and created_at > now() - interval '1 day') >= 10 then
    raise exception 'Trop de signalements aujourd''hui : réessaie demain';
  end if;
  if not exists (select 1 from public.rouler_reports where reporter_id = v_uid and target_id = v_target and status = 'open') then
    insert into public.rouler_reports (reporter_id, target_id, availability_id, reason, details)
    values (v_uid, v_target, p_handle, p_reason, left(btrim(coalesce(p_details, '')), 500));
  end if;
  -- Pause automatique : 3 personnes différentes en 30 jours
  select count(distinct reporter_id) into n from public.rouler_reports
   where target_id = v_target and created_at > now() - interval '30 days' and status in ('open','kept');
  if n >= 3 then
    update public.rouler_profiles set status = 'paused', paused_at = now(), updated_at = now() where user_id = v_target and status = 'active';
    if found then perform public.dir_mod_log('rouler.paused_auto', public.rouler_name(v_target), jsonb_build_object('reports', n)); end if;
  end if;
  return true;
end $$;

-- -----------------------------------------------------------------------------------------
-- 7. Référent UZU : signalements
-- -----------------------------------------------------------------------------------------
create or replace function public.rouler_admin_reports(p_status text default 'open') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.dir_require_moderator();
begin
  return coalesce((select jsonb_agg(x order by (x->>'last_at') desc) from (
    select jsonb_build_object(
      'key', (array_agg(r.id order by r.created_at desc))[1],
      'name', public.rouler_name(r.target_id),
      'profile_status', coalesce((select status from public.rouler_profiles where user_id = r.target_id), 'deleted'),
      'count', count(*), 'reporters', count(distinct r.reporter_id),
      'reasons', (select jsonb_object_agg(reason, n) from (select reason, count(*) n from public.rouler_reports r2
                   where r2.target_id = r.target_id and (p_status is null or r2.status = p_status) group by reason) q),
      'last_at', max(r.created_at),
      'last_details', (array_agg(r.details order by r.created_at desc))[1]) as x
      from public.rouler_reports r
     where p_status is null or r.status = p_status
     group by r.target_id) t), '[]'::jsonb);
end $$;

-- Décision sur la personne visée par le signalement p_key : maintenir la pause, rétablir, classer
create or replace function public.rouler_admin_resolve(p_key uuid, p_decision text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.dir_require_moderator(); v_target uuid;
begin
  if p_decision not in ('keep','restore','dismiss') then raise exception 'Décision inconnue'; end if;
  select target_id into v_target from public.rouler_reports where id = p_key;
  if v_target is null then raise exception 'Signalement introuvable'; end if;
  if p_decision = 'keep' then
    update public.rouler_profiles set status = 'paused', paused_at = coalesce(paused_at, now()), updated_at = now() where user_id = v_target;
    update public.rouler_reports set status = 'kept', resolved_at = now(), resolved_by = v_uid where target_id = v_target and status = 'open';
  else
    update public.rouler_profiles set status = 'active', paused_at = null, updated_at = now() where user_id = v_target;
    update public.rouler_reports set status = case when p_decision = 'restore' then 'restored' else 'dismissed' end,
           resolved_at = now(), resolved_by = v_uid where target_id = v_target and status in ('open','kept');
  end if;
  perform public.dir_mod_log('rouler.' || p_decision, public.rouler_name(v_target));
  return true;
end $$;

-- -----------------------------------------------------------------------------------------
-- 8. Expiration et purges (tâche planifiée). Les résultats n'en dépendent pas : un créneau fini en sort aussitôt.
-- -----------------------------------------------------------------------------------------
create or replace function public.rouler_expire() returns jsonb
language plpgsql security definer set search_path = public as $$
declare a int; b int; c int; d int; e int;
begin
  update public.rouler_availabilities set status = 'expired', updated_at = now() where status = 'active' and ends_at <= now();
  get diagnostics a = row_count;
  delete from public.rouler_availabilities where status in ('ended','expired') and updated_at < now() - interval '30 days';
  get diagnostics b = row_count;
  delete from public.rouler_search_log where at < now() - interval '1 day';
  get diagnostics c = row_count;
  delete from public.rouler_reports where status <> 'open' and resolved_at < now() - interval '12 months';
  get diagnostics d = row_count;
  update public.rouler_profiles set visibility = 'hidden', updated_at = now()
   where visibility <> 'hidden' and last_active_at < now() - interval '6 months'
     and not exists (select 1 from public.rouler_availabilities v where v.user_id = rouler_profiles.user_id and v.status = 'active' and v.ends_at > now());
  get diagnostics e = row_count;
  return jsonb_build_object('expires', a, 'purges', b, 'recherches', c, 'signalements', d, 'invisibles', e);
end $$;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'rouler-expire') then perform cron.unschedule('rouler-expire'); end if;
    perform cron.schedule('rouler-expire', '*/15 * * * *', 'select public.rouler_expire()');
  end if;
end $$;

-- -----------------------------------------------------------------------------------------
-- 9. Droits d'exécution
-- -----------------------------------------------------------------------------------------
revoke all on function public.rouler_name(uuid) from public, anon, authenticated;
revoke all on function public.rouler_belt(uuid) from public, anon, authenticated;
revoke all on function public.rouler_belt_rank(text) from public, anon, authenticated;
revoke all on function public.rouler_is_minor(uuid) from public, anon, authenticated;
revoke all on function public.rouler_share_club(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rouler_blocked(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rouler_disc_ok(text[]) from public, anon, authenticated;
revoke all on function public.rouler_text_array(jsonb) from public, anon, authenticated;
revoke all on function public.rouler_check_profile(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.rouler_expire() from public, anon, authenticated;
revoke all on function public.rouler_tz(text) from public, anon, authenticated;
revoke all on function public.rouler_local_ts(text, text, text) from public, anon, authenticated;
revoke all on function public.rouler_matches(uuid, text, double precision, double precision, int, timestamptz, timestamptz, interval, text, text, int, int) from public, anon, authenticated;
revoke all on function public.rouler_me() from public, anon;
revoke all on function public.rouler_activate(jsonb) from public, anon;
revoke all on function public.rouler_save_profile(jsonb) from public, anon;
revoke all on function public.rouler_set_visibility(text) from public, anon;
revoke all on function public.rouler_delete_profile() from public, anon;
revoke all on function public.rouler_save_availability(jsonb) from public, anon;
revoke all on function public.rouler_end_availability(uuid) from public, anon;
revoke all on function public.rouler_search(jsonb) from public, anon;
revoke all on function public.rouler_extend_availability(uuid) from public, anon;
revoke all on function public.rouler_block(uuid) from public, anon;
revoke all on function public.rouler_report(uuid, text, text) from public, anon;
revoke all on function public.rouler_my_blocks() from public, anon;
revoke all on function public.rouler_unblock(text) from public, anon;
revoke all on function public.rouler_admin_reports(text) from public, anon;
revoke all on function public.rouler_admin_resolve(uuid, text) from public, anon;
grant execute on function public.rouler_me() to authenticated;
grant execute on function public.rouler_activate(jsonb) to authenticated;
grant execute on function public.rouler_save_profile(jsonb) to authenticated;
grant execute on function public.rouler_set_visibility(text) to authenticated;
grant execute on function public.rouler_delete_profile() to authenticated;
grant execute on function public.rouler_save_availability(jsonb) to authenticated;
grant execute on function public.rouler_end_availability(uuid) to authenticated;
grant execute on function public.rouler_search(jsonb) to authenticated;
grant execute on function public.rouler_extend_availability(uuid) to authenticated;
grant execute on function public.rouler_block(uuid) to authenticated;
grant execute on function public.rouler_report(uuid, text, text) to authenticated;
grant execute on function public.rouler_my_blocks() to authenticated;
grant execute on function public.rouler_unblock(text) to authenticated;
grant execute on function public.rouler_admin_reports(text) to authenticated;
grant execute on function public.rouler_admin_resolve(uuid, text) to authenticated;

commit;

-- Contrôle : 4 tables ajoutées et fermées, rien pour les visiteurs non connectés, outils internes fermés, tâche planifiée
select (select count(*) from pg_tables where schemaname = 'public' and tablename like 'rouler\_%') as tables_ajoutees,
       (select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name like 'rouler\_%' and grantee in ('anon','authenticated')) as droits_directs,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname like 'rouler\_%' and has_function_privilege('anon', p.oid, 'execute')) as fonctions_pour_anon,
       (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('rouler_name','rouler_belt','rouler_is_minor','rouler_share_club','rouler_blocked','rouler_check_profile','rouler_expire','rouler_tz','rouler_local_ts','rouler_matches')
           and has_function_privilege('authenticated', p.oid, 'execute')) as outils_internes_ouverts,
       (select count(*) from pg_extension where extname = 'pg_cron') as pg_cron_present;
