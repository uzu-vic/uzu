-- =========================================================================================
-- UZU — The mat doesn't lie · BIBLIOTHÈQUE TECHNIQUE (lot A : données et droits)
--   • Catalogue UZU unique, en lecture seule : disciplines, catégories, 70 fiches (60 du document
--     + 10 complémentaires « à valider »), 4 enchaînements. Il évolue uniquement par ce script.
--   • Couche privée par club : disciplines activées, contenus du club (techniques propres, variantes,
--     notes, liens vidéo), collections, fiches masquées, historique.
--   • Droits : une ressource « library » (approve = valider/publier, manage = collections et masquage)
--     ajoutée au système de permissions existant ; tout passe par des fonctions serveur qui lisent
--     l'académie ACTIVE côté serveur, jamais un identifiant envoyé par le navigateur.
-- Prérequis : scripts d'équipe/permissions (lot 5) et uzu-6-securite.sql appliqués.
-- À exécuter dans Supabase > SQL Editor (base de TEST d'abord). Ajout seul : aucune table, colonne,
-- donnée ou règle existante n'est supprimée ni modifiée (seul le catalogue des droits reçoit une
-- ressource de plus). Rejouable. S'annule entièrement en cas d'erreur.
-- =========================================================================================
begin;

-- -----------------------------------------------------------------------------------------
-- 1. Catalogue UZU (lecture seule depuis l'application)
-- -----------------------------------------------------------------------------------------
create table if not exists public.lib_disciplines (
  id          text primary key check (id ~ '^[a-z_]{2,30}$'),
  label       text not null,
  long_label  text not null default '',
  position    int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.lib_categories (
  id             text primary key check (id ~ '^[a-z_]{2,30}_[0-9]{1,2}$'),
  discipline_id  text not null references public.lib_disciplines (id),
  position       int  not null,
  label          text not null,
  unique (discipline_id, position)
);

create table if not exists public.lib_techniques (
  id                 text primary key check (id ~ '^[A-Z][0-9]{2,3}$'),
  discipline_id      text not null references public.lib_disciplines (id),
  category_id        text not null references public.lib_categories (id),
  position           int  not null,
  name               text not null check (length(btrim(name)) between 1 and 160),
  aliases            text[] not null default '{}',
  -- texte du document, conservé tel quel (null pour une fiche complémentaire)
  source_text        text,
  -- correction ou description proposée par UZU, jamais présentée comme validée
  proposed_text      text,
  origin             text not null check (origin in ('document','proposition')),
  level              smallint check (level between 1 and 3),
  validation_status  text not null default 'a_valider' check (validation_status in ('a_valider','validee','a_corriger')),
  validated_by       uuid references auth.users (id) on delete set null,
  validated_at       timestamptz,
  validation_note    text not null default '',
  validation_refs    text[] not null default '{}',
  restricted         text check (restricted in ('cles_talon')),
  uzu_links          jsonb not null default '[]'::jsonb,
  source             text not null default '',
  version            int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (source_text is not null or proposed_text is not null),
  check (origin = 'proposition' or source_text is not null)
);
create index if not exists lib_techniques_cat_idx on public.lib_techniques (category_id, position);

create table if not exists public.lib_flows (
  id             text primary key check (id ~ '^FC[0-9]{1,2}$'),
  discipline_id  text not null references public.lib_disciplines (id),
  position       int  not null,
  title          text not null,
  intro          text not null default ''
);

create table if not exists public.lib_flow_steps (
  id            text primary key,
  flow_id       text not null references public.lib_flows (id) on delete cascade,
  position      int  not null,
  parent_id     text references public.lib_flow_steps (id) on delete cascade deferrable initially deferred,
  kind          text not null check (kind in ('depart','action','reaction','transition','finalisation','alternative')),
  branch_label  text,
  label         text not null,
  origin        text not null check (origin in ('document','proposition'))
);
create index if not exists lib_flow_steps_flow_idx on public.lib_flow_steps (flow_id, position);

create table if not exists public.lib_flow_step_techniques (
  step_id       text not null references public.lib_flow_steps (id) on delete cascade,
  technique_id  text not null references public.lib_techniques (id),
  position      int  not null default 1,
  origin        text not null check (origin in ('document','proposition')),
  primary key (step_id, technique_id)
);

-- -----------------------------------------------------------------------------------------
-- 2. Couche privée du club
-- -----------------------------------------------------------------------------------------
-- Disciplines activées. Sans ligne : toutes les disciplines actives du catalogue.
create table if not exists public.club_lib_settings (
  academy_id   uuid primary key references public.clubs (id) on delete cascade,
  disciplines  text[] not null default '{}',
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now()
);

create table if not exists public.club_lib_items (
  id                  uuid primary key default gen_random_uuid(),
  academy_id          uuid not null references public.clubs (id) on delete cascade,
  kind                text not null check (kind in ('technique','variante','note','lien','astuce')),
  technique_id        text references public.lib_techniques (id) on delete set null,
  discipline_id       text references public.lib_disciplines (id),
  title               text not null check (length(btrim(title)) between 1 and 120),
  body                text not null default '' check (length(body) <= 4000),
  url                 text check (url is null or (length(url) <= 300 and url ~ '^https://')),
  rights_declared_at  timestamptz,
  rights_declared_by  uuid references auth.users (id) on delete set null,
  status              text not null default 'brouillon' check (status in ('brouillon','en_attente','publie','refuse','archive')),
  author_id           uuid references auth.users (id) on delete set null,
  reviewer_id         uuid references auth.users (id) on delete set null,
  review_note         text not null default '' check (length(review_note) <= 1000),
  submitted_at        timestamptz,
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (url is null or status in ('brouillon','archive') or rights_declared_at is not null)
);
create index if not exists club_lib_items_academy_idx on public.club_lib_items (academy_id, status);
create index if not exists club_lib_items_author_idx on public.club_lib_items (author_id);
create index if not exists club_lib_items_tech_idx on public.club_lib_items (technique_id);

create table if not exists public.club_lib_collections (
  id           uuid primary key default gen_random_uuid(),
  academy_id   uuid not null references public.clubs (id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 80),
  description  text not null default '' check (length(description) <= 500),
  position     int not null default 0,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists club_lib_collections_academy_idx on public.club_lib_collections (academy_id, position);

create table if not exists public.club_lib_collection_items (
  collection_id  uuid not null references public.club_lib_collections (id) on delete cascade,
  position       int  not null,
  technique_id   text references public.lib_techniques (id) on delete cascade,
  item_id        uuid references public.club_lib_items (id) on delete cascade,
  primary key (collection_id, position),
  check ((technique_id is null) <> (item_id is null))
);

create table if not exists public.club_lib_hidden (
  academy_id    uuid not null references public.clubs (id) on delete cascade,
  technique_id  text not null references public.lib_techniques (id) on delete cascade,
  hidden_by     uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  primary key (academy_id, technique_id)
);

create table if not exists public.club_lib_events (
  id          bigserial primary key,
  academy_id  uuid not null references public.clubs (id) on delete cascade,
  item_id     uuid references public.club_lib_items (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists club_lib_events_item_idx on public.club_lib_events (item_id, created_at);

-- -----------------------------------------------------------------------------------------
-- 3. Droits : une ressource de plus dans le catalogue existant (rien d'autre ne change)
--    library.approve = valider, refuser, demander des précisions, corriger, publier directement
--    library.manage  = collections, ordre, masquage des fiches UZU
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
  "library":            {"actions":["approve","manage"],                   "scopes":["academy"]}
}'::jsonb $$;

-- -----------------------------------------------------------------------------------------
-- 4. Fonctions d'accès (security definer, sans récursion RLS)
-- -----------------------------------------------------------------------------------------
-- Appartenance active (équipe OU élève) de l'utilisateur connecté à une académie
create or replace function public.uzu_lib_member(p_academy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and p_academy is not null and exists (
    select 1 from public.academy_members
     where academy_id = p_academy and user_id = auth.uid() and status = 'active')
$$;

-- Disciplines du catalogue ouvertes pour une académie (réglage du club, sinon toutes les actives)
create or replace function public.uzu_lib_disciplines(p_academy uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d.id order by d.position), '{}'::text[])
    from public.lib_disciplines d
   where d.active
     and (not exists (select 1 from public.club_lib_settings s where s.academy_id = p_academy)
          or d.id = any (coalesce((select s.disciplines from public.club_lib_settings s where s.academy_id = p_academy), '{}'::text[])))
$$;

-- Une discipline est lisible si l'une des académies où l'on est membre actif l'a ouverte
create or replace function public.uzu_lib_visible(p_discipline text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.academy_members m
     where m.user_id = auth.uid() and m.status = 'active'
       and p_discipline = any (public.uzu_lib_disciplines(m.academy_id)))
$$;

create or replace function public.uzu_lib_event(p_academy uuid, p_item uuid, p_action text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.club_lib_events (academy_id, item_id, actor_id, action, details)
  values (p_academy, p_item, auth.uid(), p_action, coalesce(p_details, '{}'::jsonb))
$$;

-- Lien vidéo accepté : YouTube ou Instagram, en https
create or replace function public.uzu_lib_url_ok(p_url text) returns boolean
language sql immutable as $$
  select p_url is null or (length(p_url) <= 300
     and p_url ~* '^https://((www|m)\.)?(youtube\.com|youtu\.be|instagram\.com)/[^\s<>"'']+$')
$$;

-- -----------------------------------------------------------------------------------------
-- 5. Règles d'accès (refus par défaut ; aucune écriture directe depuis l'application)
-- -----------------------------------------------------------------------------------------
alter table public.lib_disciplines           enable row level security;
alter table public.lib_categories            enable row level security;
alter table public.lib_techniques            enable row level security;
alter table public.lib_flows                 enable row level security;
alter table public.lib_flow_steps            enable row level security;
alter table public.lib_flow_step_techniques  enable row level security;
alter table public.club_lib_settings         enable row level security;
alter table public.club_lib_items            enable row level security;
alter table public.club_lib_collections      enable row level security;
alter table public.club_lib_collection_items enable row level security;
alter table public.club_lib_hidden           enable row level security;
alter table public.club_lib_events           enable row level security;

revoke all on public.lib_disciplines, public.lib_categories, public.lib_techniques, public.lib_flows,
  public.lib_flow_steps, public.lib_flow_step_techniques, public.club_lib_settings, public.club_lib_items,
  public.club_lib_collections, public.club_lib_collection_items, public.club_lib_hidden, public.club_lib_events
  from anon, authenticated;
grant select on public.lib_disciplines, public.lib_categories, public.lib_techniques, public.lib_flows,
  public.lib_flow_steps, public.lib_flow_step_techniques, public.club_lib_settings, public.club_lib_items,
  public.club_lib_collections, public.club_lib_collection_items, public.club_lib_hidden, public.club_lib_events
  to authenticated;
revoke all on sequence public.club_lib_events_id_seq from anon, authenticated;

drop policy if exists uzu_lib_disc_select on public.lib_disciplines;
create policy uzu_lib_disc_select on public.lib_disciplines for select to authenticated using (active);
drop policy if exists uzu_lib_cat_select on public.lib_categories;
create policy uzu_lib_cat_select on public.lib_categories for select to authenticated
  using (public.uzu_lib_visible(discipline_id));
drop policy if exists uzu_lib_tech_select on public.lib_techniques;
create policy uzu_lib_tech_select on public.lib_techniques for select to authenticated
  using (public.uzu_lib_visible(discipline_id));
drop policy if exists uzu_lib_flow_select on public.lib_flows;
create policy uzu_lib_flow_select on public.lib_flows for select to authenticated
  using (public.uzu_lib_visible(discipline_id));
drop policy if exists uzu_lib_step_select on public.lib_flow_steps;
create policy uzu_lib_step_select on public.lib_flow_steps for select to authenticated
  using (exists (select 1 from public.lib_flows f where f.id = flow_id and public.uzu_lib_visible(f.discipline_id)));
drop policy if exists uzu_lib_steptech_select on public.lib_flow_step_techniques;
create policy uzu_lib_steptech_select on public.lib_flow_step_techniques for select to authenticated
  using (exists (select 1 from public.lib_flow_steps s join public.lib_flows f on f.id = s.flow_id
                  where s.id = step_id and public.uzu_lib_visible(f.discipline_id)));

drop policy if exists uzu_club_lib_settings_select on public.club_lib_settings;
create policy uzu_club_lib_settings_select on public.club_lib_settings for select to authenticated
  using (public.uzu_lib_member(academy_id));
-- Contenus : publiés pour les membres ; les siens quel que soit le statut ; file de validation
-- pour les relecteurs (jamais les brouillons des autres)
drop policy if exists uzu_club_lib_items_select on public.club_lib_items;
create policy uzu_club_lib_items_select on public.club_lib_items for select to authenticated
  using (public.uzu_lib_member(academy_id) and (
           status = 'publie' or author_id = auth.uid()
           or (status <> 'brouillon' and public.uzu_can(academy_id, 'library', 'approve'))));
drop policy if exists uzu_club_lib_coll_select on public.club_lib_collections;
create policy uzu_club_lib_coll_select on public.club_lib_collections for select to authenticated
  using (public.uzu_lib_member(academy_id));
drop policy if exists uzu_club_lib_collitem_select on public.club_lib_collection_items;
create policy uzu_club_lib_collitem_select on public.club_lib_collection_items for select to authenticated
  using (exists (select 1 from public.club_lib_collections c where c.id = collection_id and public.uzu_lib_member(c.academy_id)));
drop policy if exists uzu_club_lib_hidden_select on public.club_lib_hidden;
create policy uzu_club_lib_hidden_select on public.club_lib_hidden for select to authenticated
  using (public.uzu_lib_member(academy_id));
drop policy if exists uzu_club_lib_events_select on public.club_lib_events;
create policy uzu_club_lib_events_select on public.club_lib_events for select to authenticated
  using (public.uzu_can(academy_id, 'library', 'approve'));

-- -----------------------------------------------------------------------------------------
-- 6. Fonctions serveur (RPC) : identité, académie ACTIVE lue côté serveur, droit vérifié, historique
-- -----------------------------------------------------------------------------------------
-- Contexte de la bibliothèque pour l'interface
create or replace function public.library_context() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy();
begin
  if v_a is null or not public.uzu_lib_member(v_a) then
    return jsonb_build_object('academy', null, 'disciplines', '[]'::jsonb, 'can_review', false, 'can_manage', false, 'can_configure', false);
  end if;
  return jsonb_build_object(
    'academy', v_a,
    'disciplines', to_jsonb(public.uzu_lib_disciplines(v_a)),
    'configured', exists (select 1 from public.club_lib_settings where academy_id = v_a),
    'can_review', public.uzu_can(v_a, 'library', 'approve'),
    'can_manage', public.uzu_can(v_a, 'library', 'manage'),
    'can_configure', public.uzu_can(v_a, 'academy_settings', 'update'),
    'hidden', coalesce((select jsonb_agg(technique_id order by technique_id) from public.club_lib_hidden where academy_id = v_a), '[]'::jsonb),
    'pending', case when public.uzu_can(v_a, 'library', 'approve')
                    then (select count(*) from public.club_lib_items where academy_id = v_a and status = 'en_attente') else 0 end);
end $$;

-- Disciplines activées par le club (responsable ou droit « réglages de l'académie »)
create or replace function public.library_set_disciplines(p_disciplines text[]) returns text[]
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_list text[];
begin
  if v_a is null or not public.uzu_can(v_a, 'academy_settings', 'update') then raise exception 'Action non autorisée'; end if;
  select coalesce(array_agg(id order by position), '{}'::text[]) into v_list
    from public.lib_disciplines where active and id = any (coalesce(p_disciplines, '{}'::text[]));
  if cardinality(coalesce(p_disciplines, '{}'::text[])) <> cardinality(v_list) then raise exception 'Discipline inconnue ou inactive'; end if;
  insert into public.club_lib_settings (academy_id, disciplines, updated_by, updated_at)
  values (v_a, v_list, v_uid, now())
  on conflict (academy_id) do update set disciplines = excluded.disciplines, updated_by = excluded.updated_by, updated_at = now();
  perform public.uzu_audit(v_a, 'library.disciplines', 'academy', v_a::text, jsonb_build_object('disciplines', v_list));
  return v_list;
end $$;

-- Créer ou modifier une contribution, puis l'enregistrer en brouillon ou l'envoyer.
-- p_item : {kind, technique_id, discipline_id, title, body, url, rights}
-- Un relecteur autorisé publie directement ; les autres passent par la validation.
create or replace function public.library_save_item(p_id uuid, p_item jsonb, p_submit boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy();
  v_old public.club_lib_items; v_kind text; v_tech text; v_disc text; v_title text; v_body text; v_url text;
  v_rights boolean; v_reviewer boolean; v_status text; v_id uuid; r record;
begin
  if v_a is null or not public.uzu_lib_member(v_a) then raise exception 'Action non autorisée'; end if;
  v_reviewer := public.uzu_can(v_a, 'library', 'approve');
  v_kind  := coalesce(p_item->>'kind', '');
  v_tech  := nullif(btrim(coalesce(p_item->>'technique_id', '')), '');
  v_disc  := nullif(btrim(coalesce(p_item->>'discipline_id', '')), '');
  v_title := btrim(coalesce(p_item->>'title', ''));
  v_body  := btrim(coalesce(p_item->>'body', ''));
  v_url   := nullif(btrim(coalesce(p_item->>'url', '')), '');
  v_rights := coalesce((p_item->>'rights')::boolean, false);
  if v_kind not in ('technique','variante','note','lien','astuce') then raise exception 'Type de contenu invalide'; end if;
  if length(v_title) not between 1 and 120 then raise exception 'Titre obligatoire (120 caractères au plus)'; end if;
  if length(v_body) > 4000 then raise exception 'Texte trop long (4000 caractères au plus)'; end if;
  if not public.uzu_lib_url_ok(v_url) then raise exception 'Lien accepté : YouTube ou Instagram, en https'; end if;
  if v_kind = 'lien' and v_url is null then raise exception 'Lien vidéo obligatoire'; end if;
  if v_tech is not null then
    select discipline_id into v_disc from public.lib_techniques where id = v_tech;
    if v_disc is null then raise exception 'Fiche inconnue'; end if;
  elsif v_kind <> 'technique' then
    raise exception 'Choisis la fiche UZU concernée';
  end if;
  if v_disc is null or not (v_disc = any (public.uzu_lib_disciplines(v_a))) then raise exception 'Discipline non activée dans ce club'; end if;
  if coalesce(p_submit, false) and v_url is not null and not v_rights then
    raise exception 'Confirme que les personnes filmées (et les représentants légaux des mineurs) ont donné leur accord';
  end if;

  if p_id is not null then
    select * into v_old from public.club_lib_items where id = p_id and academy_id = v_a for update;
    if v_old.id is null or v_old.author_id is distinct from v_uid then raise exception 'Contenu introuvable'; end if;
    if v_old.status not in ('brouillon','refuse') then raise exception 'Ce contenu ne peut plus être modifié'; end if;
  elsif (select count(*) from public.club_lib_items where author_id = v_uid and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Trop de contenus créés aujourd''hui : réessaie demain';
  end if;

  v_status := case when not coalesce(p_submit, false) then 'brouillon' when v_reviewer then 'publie' else 'en_attente' end;
  if p_id is null then
    insert into public.club_lib_items (academy_id, kind, technique_id, discipline_id, title, body, url,
                                       rights_declared_at, rights_declared_by, status, author_id,
                                       submitted_at, published_at, reviewer_id)
    values (v_a, v_kind, v_tech, v_disc, v_title, v_body, v_url,
            case when v_url is not null and v_rights then now() end, case when v_url is not null and v_rights then v_uid end,
            v_status, v_uid,
            case when v_status <> 'brouillon' then now() end, case when v_status = 'publie' then now() end,
            case when v_status = 'publie' then v_uid end)
    returning id into v_id;
  else
    v_id := p_id;
    update public.club_lib_items set kind = v_kind, technique_id = v_tech, discipline_id = v_disc, title = v_title,
           body = v_body, url = v_url,
           rights_declared_at = case when v_url is not null and v_rights then now() end,
           rights_declared_by = case when v_url is not null and v_rights then v_uid end,
           status = v_status,
           submitted_at = case when v_status <> 'brouillon' then now() else submitted_at end,
           published_at = case when v_status = 'publie' then now() else null end,
           reviewer_id  = case when v_status = 'publie' then v_uid else null end,
           review_note  = case when v_status = 'brouillon' then review_note else '' end,
           updated_at = now()
     where id = v_id;
  end if;
  perform public.uzu_lib_event(v_a, v_id,
    case when p_id is null and v_status = 'brouillon' then 'creation'
         when v_status = 'brouillon' then 'modification'
         when v_status = 'publie' then 'publication_directe' else 'envoi' end,
    jsonb_build_object('kind', v_kind, 'technique', v_tech, 'rights', v_url is not null and v_rights));
  if v_status = 'en_attente' then
    for r in select distinct user_id from public.uzu_staff_with(v_a, 'library', array['approve']) where user_id <> v_uid loop
      perform public.uzu_notify(r.user_id, 'coach', 'Contenu à valider',
        'Une proposition « ' || left(v_title, 60) || ' » attend ta validation dans la bibliothèque.', 'library', 'lib:' || v_id);
    end loop;
  end if;
  return jsonb_build_object('id', v_id, 'status', v_status);
end $$;

-- Valider, refuser ou demander des précisions (avec correction possible avant publication)
create or replace function public.library_review_item(p_id uuid, p_decision text, p_note text, p_patch jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy();
        v_it public.club_lib_items; v_note text := btrim(coalesce(p_note, '')); v_status text; v_title text; v_body text;
begin
  if v_a is null or not public.uzu_can(v_a, 'library', 'approve') then raise exception 'Action non autorisée'; end if;
  select * into v_it from public.club_lib_items where id = p_id and academy_id = v_a for update;
  if v_it.id is null then raise exception 'Contenu introuvable'; end if;
  if v_it.status <> 'en_attente' then raise exception 'Ce contenu n''est pas en attente de validation'; end if;
  if p_decision not in ('publier','refuser','preciser') then raise exception 'Décision invalide'; end if;
  if p_decision in ('refuser','preciser') and length(v_note) < 3 then raise exception 'Indique un motif'; end if;
  if length(v_note) > 1000 then raise exception 'Motif trop long'; end if;
  v_title := v_it.title; v_body := v_it.body;
  if p_decision = 'publier' and p_patch is not null then
    v_title := btrim(coalesce(p_patch->>'title', v_title));
    v_body  := btrim(coalesce(p_patch->>'body', v_body));
    if length(v_title) not between 1 and 120 or length(v_body) > 4000 then raise exception 'Correction invalide'; end if;
  end if;
  v_status := case p_decision when 'publier' then 'publie' when 'refuser' then 'refuse' else 'brouillon' end;
  update public.club_lib_items set status = v_status, title = v_title, body = v_body, reviewer_id = v_uid,
         review_note = v_note, published_at = case when v_status = 'publie' then now() else published_at end,
         updated_at = now()
   where id = p_id;
  perform public.uzu_lib_event(v_a, p_id, case p_decision when 'publier' then 'validation' when 'refuser' then 'refus' else 'demande_precisions' end,
    jsonb_build_object('note', v_note, 'corrige', v_title <> v_it.title or v_body <> v_it.body));
  if v_it.author_id is not null and v_it.author_id <> v_uid then
    perform public.uzu_notify(v_it.author_id, 'coach',
      case p_decision when 'publier' then 'Contenu publié' when 'refuser' then 'Contenu refusé' else 'Précisions demandées' end,
      '« ' || left(v_title, 60) || ' » : ' || case p_decision when 'publier' then 'visible par le club.' else left(v_note, 200) end,
      'library', 'lib:' || p_id || ':' || p_decision);
  end if;
  return v_status;
end $$;

-- Archiver (l'auteur pour ses contenus, un relecteur pour tous) : rien n'est effacé
create or replace function public.library_archive_item(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_it public.club_lib_items;
begin
  if v_a is null or not public.uzu_lib_member(v_a) then raise exception 'Action non autorisée'; end if;
  select * into v_it from public.club_lib_items where id = p_id and academy_id = v_a for update;
  if v_it.id is null then raise exception 'Contenu introuvable'; end if;
  if v_it.author_id is distinct from v_uid and not public.uzu_can(v_a, 'library', 'approve') then raise exception 'Action non autorisée'; end if;
  if v_it.status = 'archive' then return true; end if;
  update public.club_lib_items set status = 'archive', updated_at = now() where id = p_id;
  perform public.uzu_lib_event(v_a, p_id, 'archivage', jsonb_build_object('ancien_statut', v_it.status));
  return true;
end $$;

-- Masquer une fiche UZU non enseignée dans le club
create or replace function public.library_set_hidden(p_technique text, p_hidden boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy();
begin
  if v_a is null or not public.uzu_can(v_a, 'library', 'manage') then raise exception 'Action non autorisée'; end if;
  if not exists (select 1 from public.lib_techniques where id = p_technique) then raise exception 'Fiche inconnue'; end if;
  if coalesce(p_hidden, false) then
    insert into public.club_lib_hidden (academy_id, technique_id, hidden_by) values (v_a, p_technique, v_uid)
    on conflict do nothing;
  else
    delete from public.club_lib_hidden where academy_id = v_a and technique_id = p_technique;
  end if;
  perform public.uzu_audit(v_a, case when p_hidden then 'library.hide' else 'library.show' end, 'technique', p_technique, '{}'::jsonb);
  return coalesce(p_hidden, false);
end $$;

-- Créer ou modifier une collection ordonnée. p_items : [{"t":"G01"}, {"i":"<uuid contenu publié>"}]
create or replace function public.library_save_collection(p_id uuid, p_name text, p_description text, p_position int, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_id uuid; v_e jsonb; v_n int := 0;
begin
  if v_a is null or not public.uzu_can(v_a, 'library', 'manage') then raise exception 'Action non autorisée'; end if;
  if length(btrim(coalesce(p_name, ''))) not between 1 and 80 then raise exception 'Nom obligatoire (80 caractères au plus)'; end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 200 then raise exception 'Liste invalide'; end if;
  if p_id is null then
    if (select count(*) from public.club_lib_collections where academy_id = v_a) >= 100 then raise exception 'Trop de collections'; end if;
    insert into public.club_lib_collections (academy_id, name, description, position, created_by)
    values (v_a, btrim(p_name), left(btrim(coalesce(p_description, '')), 500), coalesce(p_position, 0), v_uid) returning id into v_id;
  else
    update public.club_lib_collections set name = btrim(p_name), description = left(btrim(coalesce(p_description, '')), 500),
           position = coalesce(p_position, position), updated_at = now()
     where id = p_id and academy_id = v_a returning id into v_id;
    if v_id is null then raise exception 'Collection introuvable'; end if;
    delete from public.club_lib_collection_items where collection_id = v_id;
  end if;
  for v_e in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_n := v_n + 1;
    if v_e ? 't' then
      if not exists (select 1 from public.lib_techniques where id = v_e->>'t') then raise exception 'Fiche inconnue'; end if;
      insert into public.club_lib_collection_items (collection_id, position, technique_id) values (v_id, v_n, v_e->>'t');
    elsif v_e ? 'i' then
      if not exists (select 1 from public.club_lib_items where id = public.uzu_try_uuid(v_e->>'i') and academy_id = v_a and status = 'publie') then
        raise exception 'Seuls les contenus publiés du club peuvent entrer dans une collection';
      end if;
      insert into public.club_lib_collection_items (collection_id, position, item_id) values (v_id, v_n, (v_e->>'i')::uuid);
    else raise exception 'Élément invalide'; end if;
  end loop;
  perform public.uzu_audit(v_a, 'library.collection', 'collection', v_id::text, jsonb_build_object('items', v_n));
  return v_id;
end $$;

create or replace function public.library_delete_collection(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_name text;
begin
  if v_a is null or not public.uzu_can(v_a, 'library', 'manage') then raise exception 'Action non autorisée'; end if;
  delete from public.club_lib_collections where id = p_id and academy_id = v_a returning name into v_name;
  if v_name is null then raise exception 'Collection introuvable'; end if;
  perform public.uzu_audit(v_a, 'library.collection_deleted', 'collection', p_id::text, jsonb_build_object('name', v_name));
  return true;
end $$;

revoke all on function public.uzu_lib_member(uuid) from public, anon;
revoke all on function public.uzu_lib_disciplines(uuid) from public, anon;
revoke all on function public.uzu_lib_visible(text) from public, anon;
revoke all on function public.uzu_lib_event(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.library_context() from public, anon;
revoke all on function public.library_set_disciplines(text[]) from public, anon;
revoke all on function public.library_save_item(uuid, jsonb, boolean) from public, anon;
revoke all on function public.library_review_item(uuid, text, text, jsonb) from public, anon;
revoke all on function public.library_archive_item(uuid) from public, anon;
revoke all on function public.library_set_hidden(text, boolean) from public, anon;
revoke all on function public.library_save_collection(uuid, text, text, int, jsonb) from public, anon;
revoke all on function public.library_delete_collection(uuid) from public, anon;
grant execute on function public.uzu_lib_member(uuid) to authenticated;
grant execute on function public.uzu_lib_disciplines(uuid) to authenticated;
grant execute on function public.uzu_lib_visible(text) to authenticated;
grant execute on function public.library_context() to authenticated;
grant execute on function public.library_set_disciplines(text[]) to authenticated;
grant execute on function public.library_save_item(uuid, jsonb, boolean) to authenticated;
grant execute on function public.library_review_item(uuid, text, text, jsonb) to authenticated;
grant execute on function public.library_archive_item(uuid) to authenticated;
grant execute on function public.library_set_hidden(text, boolean) to authenticated;
grant execute on function public.library_save_collection(uuid, text, text, int, jsonb) to authenticated;
grant execute on function public.library_delete_collection(uuid) to authenticated;

-- -----------------------------------------------------------------------------------------
-- 7. Données du catalogue (générées depuis le document, voir db/bibliotheque/build.mjs)
-- -----------------------------------------------------------------------------------------
