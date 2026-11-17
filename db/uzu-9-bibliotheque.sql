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
-- Données générées par db/bibliotheque/build.mjs — ne pas modifier à la main
insert into public.lib_disciplines (id, label, long_label, position, active) values
  ('jjb_gi', 'JJB Gi', 'Jiu-jitsu brésilien en kimono', 1, true),
  ('grappling_nogi', 'Grappling No-Gi', 'Grappling sans kimono', 2, true),
  ('mma', 'MMA', 'Arts martiaux mixtes', 3, false)
on conflict (id) do update set label = excluded.label, long_label = excluded.long_label, position = excluded.position, active = excluded.active;

insert into public.lib_categories (id, discipline_id, position, label) values
  ('jjb_gi_1', 'jjb_gi', 1, 'Amenées au sol et entrée en garde'),
  ('jjb_gi_2', 'jjb_gi', 2, 'Gardes ouvertes et rétention'),
  ('jjb_gi_3', 'jjb_gi', 3, 'Renversements / Sweeps'),
  ('jjb_gi_4', 'jjb_gi', 4, 'Passages de garde'),
  ('jjb_gi_5', 'jjb_gi', 5, 'Contrôles et évasions'),
  ('jjb_gi_6', 'jjb_gi', 6, 'Finalisations'),
  ('grappling_nogi_1', 'grappling_nogi', 1, 'Lutte et amenées au sol'),
  ('grappling_nogi_2', 'grappling_nogi', 2, 'Gardes ouvertes et rétention'),
  ('grappling_nogi_3', 'grappling_nogi', 3, 'Renversements et Wrestle-Ups'),
  ('grappling_nogi_4', 'grappling_nogi', 4, 'Passages de garde'),
  ('grappling_nogi_5', 'grappling_nogi', 5, 'Contrôles et évasions'),
  ('grappling_nogi_6', 'grappling_nogi', 6, 'Finalisations')
on conflict (id) do update set discipline_id = excluded.discipline_id, position = excluded.position, label = excluded.label;

insert into public.lib_techniques (id, discipline_id, category_id, position, name, aliases, source_text, proposed_text, origin, level, validation_refs, restricted, uzu_links, source) values
  ('G01', 'jjb_gi', 'jjb_gi_1', 1, 'Ankle Pick (Saisie de cheville)', '{}'::text[], 'Casser la posture de l''adversaire par une forte traction vers le bas sur le col croisé (main droite au col gauche). Abaisser simultanément son propre niveau en fléchissant les jambes pour venir bloquer la cheville située du même côté (cheville gauche avec la main gauche) et pousser l''épaule vers l''arrière.', null, 'document', null, array['V1']::text[], null, '["sys:lutte:Takedowns"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G02', 'jjb_gi', 'jjb_gi_1', 2, 'Projections en sacrifice (Tomoe Nage / Sumi Gaeshi)', array['Tomoe Nage','Sumi Gaeshi']::text[], 'Idéales lorsque l''adversaire adopte une posture très basse et défensive. Saisir le col et la manche, s''asseoir près de ses pieds en plaçant un pied sur sa hanche (Tomoe Nage) ou un crochet papillon à l''intérieur de sa cuisse (Sumi Gaeshi) pour le projeter par-dessus soi en roulant sur le dos.', null, 'document', null, array['V2','S2']::text[], null, '["sys:lutte:Takedowns"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G03', 'jjb_gi', 'jjb_gi_1', 3, 'Single Leg (Saisie à une jambe) avec saisie du col', '{}'::text[], 'Saisir le col pour tirer l''adversaire vers soi et alourdir sa jambe avant. Changer de niveau, envelopper sa cuisse avec les deux bras (tête collée à l''intérieur de ses côtes) et pivoter pour le faire chuter tout en gardant le contrôle du kimono pour l''empêcher de reculer.', null, 'document', null, array['V3']::text[], null, '["sys:lutte:Takedowns"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G04', 'jjb_gi', 'jjb_gi_1', 4, 'Pull Guard vers Collar-Sleeve (Tirage de garde Col-Manche)', array['Col-Manche']::text[], 'Saisir fermement le col croisé et la manche opposée pour contrôler la distance. S''asseoir au sol en plaçant immédiatement le pied côté manche sur sa hanche et l''autre pied dans le creux de son épaule pour créer une tension constante.', null, 'document', null, array['V4']::text[], null, '["sys:fond"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G05', 'jjb_gi', 'jjb_gi_1', 5, 'Guard Pull vers De La Riva (Tirage de garde DLR)', array['DLR']::text[], 'Saisir le col et la manche (ou le bas du pantalon) pour s''asseoir sur la hanche. Engager immédiatement le crochet De La Riva derrière son genou avant en enroulant la jambe de l''extérieur vers l''intérieur, tout en plaçant l''autre pied sur sa hanche opposée.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G06', 'jjb_gi', 'jjb_gi_2', 1, 'Garde Collar-Sleeve (Col-Manche)', '{}'::text[], 'Maintenir une traction diagonale forte (col croisé et manche opposée) couplée à un pied sur la hanche et un pied dans l''épaule. Cette tension constante casse la posture du passeur, crée des angles de sortie de hanche et ouvre directement les attaques en triangle ou omoplata.', null, 'document', null, array['V4']::text[], null, '["sys:fond"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G07', 'jjb_gi', 'jjb_gi_2', 2, 'De La Riva (DLR) vers Berimbolo', array['Berimbolo']::text[], 'Utiliser le crochet De La Riva et le contrôle de la cheville pour forcer l''adversaire à poser ses fesses au tapis. S''inverser ensuite sous ses hanches (en roulant sur les épaules, jamais sur la nuque) pour saisir sa ceinture ou son pantalon et remonter directement dans son dos.', null, 'document', null, array['T2']::text[], null, '["tech:sw-berimbolo"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G08', 'jjb_gi', 'jjb_gi_2', 3, 'Lasso Guard et Spider-Lasso', array['Spider-Lasso','Spider Guard']::text[], 'Passer sa jambe par-dessus le bras de l''adversaire et enrouler le mollet autour de son biceps en calant le pied sous son aisselle (Lasso). Coupler ce verrouillage avec un pied en poussée sur l''autre biceps (Spider) pour neutraliser totalement les passeurs rapides.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G09', 'jjb_gi', 'jjb_gi_2', 4, 'Lapel Guard (Garde avec revers : Worm Guard / Squid Guard)', array['Worm Guard','Squid Guard']::text[], 'Défaire le bas de la veste de l''adversaire et le passer derrière son genou ou entre ses jambes pour le récupérer avec sa main libre. Ce lien en tissu immobilise sa jambe d''appui, bloque sa mobilité latérale et offre des leviers puissants pour le renverser.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G10', 'jjb_gi', 'jjb_gi_2', 5, 'Reverse De La Riva (RDLR) avec Kiss of the Dragon', array['Kiss of the Dragon','RDLR']::text[], 'Face à un adversaire qui tente un Knee Cut, placer un crochet inversé à l''intérieur de sa cuisse avant et saisir sa cheville. S''inverser sous son centre de gravité en plongeant la tête sous sa hanche pour exposer son dos et prendre ses crochets.', null, 'document', null, array['S3']::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G11', 'jjb_gi', 'jjb_gi_2', 6, 'Rétention par Granby Roll et cadrage (Framing)', array['Granby Roll','Framing']::text[], 'Dès que le passeur franchit la ligne des pieds, utiliser la structure osseuse des avant-bras (frames) sur son cou et sa hanche pour stopper sa progression. Rouler ensuite d''une épaule à l''autre (Granby Roll) en gardant les genoux groupés vers la poitrine pour replacer ses tibias devant lui.', null, 'document', null, array['S3']::text[], null, '["sys:fond:Rétention de garde"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G12', 'jjb_gi', 'jjb_gi_3', 1, 'Tripod Sweep (Renversement trépied) et Sickle Sweep (Renversement faucille)', array['Sickle Sweep']::text[], 'Face à un adversaire debout, contrôler sa manche et sa cheville. Placer un pied sur sa hanche et l''autre derrière son genou pour le faire tomber en arrière (Tripod). S''il recule la jambe attaquée, faucher immédiatement son autre cheville au ras du tapis (Sickle).', null, 'document', null, array['V5']::text[], null, '["tech:sw-tripod"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G13', 'jjb_gi', 'jjb_gi_3', 2, 'Scissor Sweep (Renversement ciseau)', '{}'::text[], 'Depuis la garde fermée ou ouverte, saisir le col et la manche, puis effectuer un décalage de hanche (langouste) pour créer un angle. Placer un tibia en travers de son abdomen et l''autre jambe au ras du sol pour faucher son genou d''appui tout en tirant sur ses bras.', null, 'document', null, '{}'::text[], null, '["tech:sw-scissor"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G14', 'jjb_gi', 'jjb_gi_3', 3, 'Waiter Sweep (Renversement du serveur depuis la Deep Half Guard)', array['Deep Half Guard']::text[], 'Se glisser profondément sous les hanches de l''adversaire en enveloppant sa cuisse. Soulever sa jambe comme un plateau de serveur tout en le déséquilibrant vers l''arrière pour le faire basculer et remonter en position dominante.', null, 'document', null, array['V6']::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G15', 'jjb_gi', 'jjb_gi_3', 4, 'Overhead Sweep (Tomoe Nage depuis la garde)', '{}'::text[], 'Lorsque l''adversaire met beaucoup de pression vers l''avant, saisir le col et une manche (ou les deux manches). Placer les deux pieds sur ses hanches, se laisser rouler sur le dos et déployer les jambes vers le haut pour le projeter par-dessus soi.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G16', 'jjb_gi', 'jjb_gi_3', 5, 'Berimbolo / Crab Ride vers prise de dos', array['Crab Ride']::text[], 'Après avoir déséquilibré l''adversaire au sol, utiliser le Crab Ride (crochets placés derrière ses genoux et contrôle ferme des hanches/pantalon) pour le maintenir assis. Grimper ensuite le long de son buste pour sécuriser la ceinture de sécurité (Seatbelt) et les crochets.', null, 'document', null, array['T2']::text[], null, '["tech:sw-berimbolo"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G17', 'jjb_gi', 'jjb_gi_4', 1, 'Torreando Pass (Passage du torero)', array['Toreando']::text[], 'Saisir le bas du pantalon au niveau des chevilles, tendre les bras pour contrôler ses jambes et les jeter d''un côté. Contourner immédiatement sa hanche en venant coller son épaule ou sa tête sur son torse pour l''empêcher de revenir face à vous.', null, 'document', null, '{}'::text[], null, '["tech:gp-toreando"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G18', 'jjb_gi', 'jjb_gi_4', 2, 'Knee Cut Pass (Passage en coupant le genou)', array['Knee Slice']::text[], 'Ouvrir la garde, poser un genou au centre et glisser le tibia en diagonale par-dessus sa cuisse jusqu''au tapis. Sécuriser simultanément un underhook (bras sous son aisselle) et tirer sa manche opposée vers le haut pour plaquer ses épaules au sol.', null, 'document', null, '{}'::text[], null, '["tech:gp-kneeslice"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G19', 'jjb_gi', 'jjb_gi_4', 3, 'Leg Drag Pass', '{}'::text[], 'Saisir la cheville et le genou de l''adversaire pour dévier sa jambe en travers de sa propre hanche. Bloquer sa jambe avec sa propre hanche pour l''empêcher de la retirer, tout en saisissant son col pour fixer le haut de son corps et passer sur le côté.', null, 'document', null, array['V7']::text[], null, '["tech:gp-legdrag"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G20', 'jjb_gi', 'jjb_gi_4', 4, 'Over-Under Pass', '{}'::text[], 'Passer un bras par-dessus une jambe (en saisissant la hanche) et l''autre bras par-dessous l''autre jambe (en la calant sur son épaule). Coller sa tête contre ses côtes pour éviter les étranglements, marcher sur le côté et dégager sa jambe piégée.', null, 'document', null, '{}'::text[], null, '["tech:gp-overunder"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G21', 'jjb_gi', 'jjb_gi_4', 5, 'Double Under Pass (Stack Pass)', array['Stack Pass']::text[], 'Passer les deux bras sous les cuisses de l''adversaire et joindre les mains ou saisir ses revers. Avancer les hanches pour l''empiler sur ses épaules (le plier en deux), puis faire basculer ses jambes sur le côté pour stabiliser le contrôle latéral.', null, 'document', null, array['S2']::text[], null, '["tech:gp-doubleund"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G22', 'jjb_gi', 'jjb_gi_4', 6, 'Long Step Pass (Passage en grand pas)', '{}'::text[], 'Face à une demi-garde ou une garde De La Riva, saisir fermement le col et le pantalon. Effectuer un grand pas circulaire vers l''arrière avec la jambe libre pour extraire le pied piégé, tout en gardant la tête basse et la pression sur le haut du corps.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G23', 'jjb_gi', 'jjb_gi_5', 1, 'Contrôle du dos (Seatbelt ou prise de col croisée)', array['Seatbelt']::text[], 'Coller sa poitrine contre le dos de l''adversaire en engageant les deux talons à l''intérieur de ses cuisses (crochets). Verrouiller les mains en ceinture de sécurité (Seatbelt : un bras par-dessus l''épaule, l''autre sous l''aisselle) ou saisir son col croisé pour bloquer ses épaules.', null, 'document', null, '{}'::text[], null, '["sys:controle:Back attack"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G24', 'jjb_gi', 'jjb_gi_5', 2, 'Crossface et contrôle de manche en position latérale (Side Control)', array['Crossface','Side Control']::text[], 'Passer un bras sous la nuque de l''adversaire pour appliquer une forte pression de l''épaule sur sa mâchoire (Crossface) et tourner sa tête. Avec l''autre main, contrôler sa manche éloignée ou sa hanche pour neutraliser toute tentative de langouste.', null, 'document', null, '{}'::text[], null, '["sys:fond:Contrôle latéral et monte"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G25', 'jjb_gi', 'jjb_gi_5', 3, 'Elbow-Knee Escape (Langouste) avec cadrage', array['Langouste','Shrimp']::text[], 'Sous la pression latérale, placer un avant-bras en cadre contre le cou du passeur et l''autre contre sa hanche pour créer de l''espace. Pousser sur ses pieds pour sortir les hanches vers l''arrière (langouste) et glisser le genou inférieur entre vous deux pour récupérer la garde.', null, 'document', null, '{}'::text[], null, '["sys:fond:Sorties de monte et contrôle latéral"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G26', 'jjb_gi', 'jjb_gi_5', 4, 'Half Guard Knee Shield (Demi-garde bouclier) vers boucle de revers', array['Knee Shield']::text[], 'En demi-garde, placer son tibia supérieur en diagonale contre le torse du passeur pour maintenir la distance. Défaire son revers, le passer sous son bras pour le saisir et neutraliser sa posture, puis remonter sur un coude en position Dogfight.', null, 'document', null, array['V8']::text[], null, '["sys:fond:Demi-garde"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G27', 'jjb_gi', 'jjb_gi_6', 1, 'Bow and Arrow Choke (Étranglement arc et flèche)', '{}'::text[], 'Depuis le dos avec une prise profonde au col, saisir le pantalon de l''adversaire au niveau du genou avec l''autre main. Basculer sur le côté, passer la jambe par-dessus son épaule pour bloquer son bras et tirer simultanément sur le col et la jambe comme pour bander un arc.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G28', 'jjb_gi', 'jjb_gi_6', 2, 'Cross Collar Choke (Étranglement croisé)', '{}'::text[], 'Depuis la garde fermée ou la position montée, glisser une main profondément derrière le col (pouce à l''intérieur). Glisser la seconde main par-dessous ou par-dessus la première pour saisir l''autre côté du col, puis effectuer une rotation des poignets en ramenant les coudes vers les hanches.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G29', 'jjb_gi', 'jjb_gi_6', 3, 'Loop Choke (Étranglement en boucle)', '{}'::text[], 'Saisir le col de l''adversaire (pouce à l''intérieur) et l''inciter à baisser la tête. Passer son autre bras sous sa tête pour envelopper sa nuque, glisser la main derrière son épaule et lever le coude du bras qui tient le col pour fermer la boucle autour de sa gorge.', null, 'document', null, array['V9']::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G30', 'jjb_gi', 'jjb_gi_6', 4, 'Enchaînement Triangle et Armbar (Clé de bras)', array['Triangle','Armbar']::text[], 'Depuis la garde fermée ou Col-Manche, tirer une manche vers soi tout en repoussant l''autre bras pour créer un déséquilibre (un bras dedans, un bras dehors). Verrouiller le triangle avec les jambes ; si l''adversaire se redresse pour défendre, pivoter à 90 degrés et passer la jambe sur son visage pour finir en clé de bras.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N01', 'grappling_nogi', 'grappling_nogi_1', 1, 'Snap Down vers Front Headlock', array['Front Headlock']::text[], 'Casser la posture de l''adversaire par des tractions sèches sur la nuque et les poignets pour amener ses mains au tapis. Enchaîner immédiatement en contrôlant sa tête sous son aisselle et son bras opposé (Front Headlock) pour attaquer le dos ou un étranglement.', null, 'document', null, '{}'::text[], null, '["sys:lutte:Snap down","sys:controle:Front headlock"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N02', 'grappling_nogi', 'grappling_nogi_1', 2, 'Single Leg (Saisie à une jambe) avec finition Run the Pipe', array['Run the Pipe']::text[], 'Changer de niveau, saisir la jambe avant avec les deux mains et coller son oreille contre les côtes de l''adversaire pour éviter la guillotine. Pivoter en cercle vers l''arrière tout en poussant la tête contre son buste (Run the Pipe) pour le faire chuter.', null, 'document', null, '{}'::text[], null, '["sys:lutte:Takedowns"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N03', 'grappling_nogi', 'grappling_nogi_1', 3, 'Arm Drag (Décalage de bras debout ou assis) vers prise de dos', array['Arm Drag']::text[], 'Saisir le poignet de l''adversaire avec une main et venir frapper/tirer l''arrière de son triceps avec l''autre main pour traverser son bras devant lui. Glisser immédiatement derrière son épaule pour coller sa poitrine à son dos et verrouiller la taille.', null, 'document', null, '{}'::text[], null, '["sys:lutte:Takedowns"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N04', 'grappling_nogi', 'grappling_nogi_1', 4, 'Body Lock Takedown (Ceinture arrière ou avant)', array['Body Lock']::text[], 'Fermer les mains autour de la taille de l''adversaire en gardant la tête collée sous son menton ou sur sa poitrine. Lever ses hanches pour le déraciner du sol, puis le faire basculer sur le côté en tombant en contrôle latéral.', null, 'document', null, array['S2']::text[], null, '["sys:lutte:Takedowns"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N05', 'grappling_nogi', 'grappling_nogi_1', 5, 'Slide By (Décalage de bras sur poussée)', '{}'::text[], 'Lorsque l''adversaire exerce une pression vers l''avant avec son bras sur votre nuque, saisir son poignet, lever le coude et glisser votre tête sous son aisselle. Pivoter rapidement dans son dos en utilisant son propre élan vers l''avant.', null, 'document', null, '{}'::text[], null, '["sys:lutte:Transitions dynamiques"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N06', 'grappling_nogi', 'grappling_nogi_2', 1, 'Seated Guard (Garde assise) avec Hand Fighting', array['Hand Fighting']::text[], 'Rester assis le buste incliné vers l''avant (jamais allongé sans contact) en gardant les coudes serrés. Engager une bataille de mains constante pour contrôler les poignets et la nuque de l''adversaire afin d''empêcher ses entrées en passage.', null, 'document', null, '{}'::text[], null, '["sys:lutte:Hand-fighting"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N07', 'grappling_nogi', 'grappling_nogi_2', 2, 'Butterfly Guard (Garde papillon)', '{}'::text[], 'Assis face à l''adversaire, insérer les deux pieds à l''intérieur de ses cuisses (crochets papillon). Rester actif sur les fesses pour contrôler le haut de son corps (underhooks ou contrôle de nuque) et se glisser sous son centre de gravité.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N08', 'grappling_nogi', 'grappling_nogi_2', 3, 'Single Leg X (SLX / Ashi Garami)', array['SLX','Ashi Garami']::text[], 'S''insérer sous l''adversaire debout en plaçant un pied sur sa hanche et l''autre jambe enroulée autour de sa cuisse, genoux serrés autour de son genou. Cette structure isole sa jambe, le déséquilibre vers l''arrière et ouvre les clés de cheville ou de talon.', null, 'document', null, array['V10','S1']::text[], null, '["sys:jambes:Entrées de leglocks"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N09', 'grappling_nogi', 'grappling_nogi_2', 4, 'Demi-garde avec Knee Shield (Bouclier de genou / Z-Guard)', array['Z-Guard']::text[], 'Sur le côté, placer son tibia supérieur en diagonale devant le torse du passeur pour bloquer sa pression. Garder un contrôle sur son poignet et son épaule pour créer l''espace nécessaire afin de glisser un underhook ou attaquer les jambes.', null, 'document', null, '{}'::text[], null, '["sys:fond:Demi-garde"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N10', 'grappling_nogi', 'grappling_nogi_2', 5, 'K-Guard', '{}'::text[], 'Depuis la garde fermée ou ouverte, pivoter sur l''épaule pour passer une jambe sous l''aisselle de l''adversaire et saisir son talon. Cette position permet de passer sous sa jambe d''appui pour entrer directement en Backside 50/50 (clé de talon) ou prendre son dos.', null, 'document', null, array['V11','S1']::text[], null, '["sys:jambes:Entrées de leglocks"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N11', 'grappling_nogi', 'grappling_nogi_2', 6, 'Rétention par Supine Guard et High Pummel', array['Supine Guard','High Pummel']::text[], 'Sur le dos face à un passeur rapide, garder les genoux collés à la poitrine pour fermer l''espace interne. Utiliser le High Pummel (passer ses pieds par-dessus les bras du passeur) pour replacer ses pieds sur ses épaules et ses hanches sans aucun grip.', null, 'document', null, '{}'::text[], null, '["sys:fond:Rétention de garde"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N12', 'grappling_nogi', 'grappling_nogi_3', 1, 'Butterfly Sweep (Sumi Gaeshi avec underhook)', '{}'::text[], 'Depuis la garde papillon, sécuriser un underhook profond d''un côté et contrôler le coude ou le poignet de l''autre. Tomber sur l''épaule côté bras bloqué tout en soulevant l''adversaire avec le crochet papillon opposé pour le renverser en position montée.', null, 'document', null, '{}'::text[], null, '["tech:sw-butterfly"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N13', 'grappling_nogi', 'grappling_nogi_3', 2, 'Wrestle-Up depuis la garde assise (Single Leg)', array['Technical Stand-Up']::text[], 'Dès que l''adversaire recule ou rompt le contact pour éviter votre garde, poser une main au sol derrière soi et se relever explosivement (Technical Stand-Up). Venir cueillir sa cheville ou son genou avant pour terminer en Single Leg.', null, 'document', null, '{}'::text[], null, '["sys:lutte:Wrestle-up"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N14', 'grappling_nogi', 'grappling_nogi_3', 3, 'Arm Drag depuis la garde assise vers prise de dos ou renversement', '{}'::text[], 'Tirer le poignet et le triceps de l''adversaire en travers de votre buste pour exposer son dos. Glisser les hanches sur le côté pour grimper dans son dos, ou crocheter sa jambe d''appui s''il résiste pour le faire tomber en arrière.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N15', 'grappling_nogi', 'grappling_nogi_3', 4, 'John Wayne Sweep (Giggler)', array['Giggler']::text[], 'Depuis la demi-garde, bloquer le poignet du passeur contre votre buste pour l''empêcher de se rattraper au sol. Utiliser le genou inférieur pour lever son genou vers l''extérieur tout en basculant sur le côté, ce qui crée un effet de levier imparable pour le renverser.', null, 'document', null, array['V12']::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N16', 'grappling_nogi', 'grappling_nogi_3', 5, 'Lockdown vers Electric Chair Sweep', array['Lockdown','Electric Chair']::text[], 'En demi-garde à plat, verrouiller la jambe de l''adversaire en enroulant vos deux jambes autour de la sienne (Lockdown). Étirer sa jambe pour casser sa base, plonger sous son centre de gravité en contrôlant sa cuisse opposée et le basculer vers l''avant (Electric Chair).', null, 'document', null, array['V13']::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N17', 'grappling_nogi', 'grappling_nogi_4', 1, 'Body Lock Pass', '{}'::text[], 'S''approcher au corps à corps, verrouiller ses mains autour des hanches de l''adversaire et poser la tête sur son sternum. Écraser ses jambes avec son propre poids, dégager un genou puis l''autre par-dessus ses tibias pour stabiliser le contrôle latéral.', null, 'document', null, '{}'::text[], null, '["tech:gp-bodylock"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N18', 'grappling_nogi', 'grappling_nogi_4', 2, 'Knee Cut Pass avec Underhook et contrôle de tête', array['Knee Slice']::text[], 'Ouvrir la garde, poser un genou au centre et glisser le tibia en diagonale par-dessus sa cuisse. Gagner impérativement l''espace sous son aisselle (underhook) et contrôler sa tête avec l''autre bras pour coller ses épaules au tapis.', null, 'document', null, '{}'::text[], null, '["tech:gp-kneeslice"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N19', 'grappling_nogi', 'grappling_nogi_4', 3, 'Camping / J-Point Camping', '{}'::text[], 'Bloquer les hanches de l''adversaire en se plaçant sur le côté avec une forte pression de l''épaule et des mains. Maintenir cette position d''attente (Camping) pour épuiser ses muscles abdominaux et fléchisseurs de hanche avant de contourner définitivement sa garde.', null, 'document', null, array['V14']::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N20', 'grappling_nogi', 'grappling_nogi_4', 4, 'Loose Pass / Torreando No-Gi (Passage à distance)', array['Toreando']::text[], 'Saisir l''arrière des chevilles ou des tibias en gardant les bras tendus pour maintenir la distance. Dévier rapidement ses jambes d''un côté tout en se déplaçant à l''opposé vers sa tête pour contourner ses hanches sans entrer dans sa garde.', null, 'document', null, '{}'::text[], null, '["tech:gp-toreando"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N21', 'grappling_nogi', 'grappling_nogi_4', 5, 'Leg Drag Pass (avec contrôle de hanche)', '{}'::text[], 'Saisir la cheville et le genou de l''adversaire pour faire traverser sa jambe devant sa propre hanche. Bloquer immédiatement sa hanche opposée avec sa main libre ou son genou pour l''empêcher de se tourner et stabiliser le passage.', null, 'document', null, '{}'::text[], null, '["tech:gp-legdrag"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N22', 'grappling_nogi', 'grappling_nogi_4', 6, 'Smash Pass (depuis Headquarters)', array['Headquarters']::text[], 'Depuis la position Headquarters (un pied au centre entre ses jambes), plier les deux genoux de l''adversaire sur un même côté en écrasant ses cuisses avec son poids. Contrôler sa tête ou son épaule éloignée pour l''empêcher de faire la langouste et passer en position latérale.', null, 'document', null, array['F2']::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N23', 'grappling_nogi', 'grappling_nogi_5', 1, 'Back Control avec Body Triangle et Hand Fighting', array['Body Triangle','Straight Jacket']::text[], 'Verrouiller un triangle autour de la taille de l''adversaire (Body Triangle) pour immobiliser ses hanches. Utiliser le Hand Fighting pour piéger l''un de ses bras avec sa propre jambe (Straight Jacket) et isoler son cou.', null, 'document', null, array['V15']::text[], null, '["sys:controle:Back attack"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N24', 'grappling_nogi', 'grappling_nogi_5', 2, 'Half Guard vers Dogfight (Underhook battle)', array['Dogfight']::text[], 'Depuis la demi-garde, glisser un underhook profond sous l''aisselle du passeur et se redresser sur un coude puis sur les genoux (Dogfight). Pousser vers l''adversaire pour le renverser ou pivoter derrière lui pour prendre son dos.', null, 'document', null, '{}'::text[], null, '["sys:fond:Demi-garde"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N25', 'grappling_nogi', 'grappling_nogi_5', 3, 'Heel Slip (Extraction du talon)', '{}'::text[], 'Dès qu''une clé de talon est engagée, pousser sur la hanche de l''adversaire avec le pied libre, tourner le genou vers l''extérieur pour libérer la ligne du genou et faire glisser son talon hors de la prise de son aisselle.', 'Sortir avant que la prise se ferme : dès que l''adversaire va chercher le talon, cacher le talon, dégager la ligne du genou (amener son genou au-delà des hanches de l''adversaire), pousser sur sa hanche avec le pied libre et retirer la jambe en ligne droite, sans rotation, hors de son aisselle. Sécurité : si la clé est déjà serrée, ne pas tourner, taper. Aucune consigne de rotation tant qu''un professeur ne l''a pas précisée selon la clé (interne ou externe).', 'document', null, array['V16','S1']::text[], 'cles_talon', '["sys:jambes"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N26', 'grappling_nogi', 'grappling_nogi_5', 4, 'Kipping Escape (Évasion par bascule du bassin)', array['Kipping']::text[], 'Sous la position montée ou latérale sans friction de kimono, placer ses mains en cadre sur les hanches du passeur. Effectuer des mouvements explosifs de flexion-extension du bassin (Kipping) pour soulever son poids et réinsérer ses genoux.', null, 'document', null, '{}'::text[], null, '["sys:fond:Sorties de monte et contrôle latéral"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N27', 'grappling_nogi', 'grappling_nogi_6', 1, 'Rear Naked Choke (Mata Leão à une main)', array['RNC','Mata Leão']::text[], 'Une fois un bras de l''adversaire piégé par vos jambes, glisser l''avant-bras sous son menton en alignant le coude avec sa trachée. Placer la main derrière sa nuque (sans avoir besoin du second bras) et serrer le coude vers l''épaule pour couper la circulation.', 'Glisser l''avant-bras sous son menton, le pli du coude centré sous le menton, le biceps et l''avant-bras de part et d''autre du cou. Version à une main (son bras piégé) : la main du bras qui étrangle saisit votre épaule opposée, l''autre main contrôle sa tête ou son poignet. Serrer en rapprochant le coude, tête collée contre la sienne. Sécurité : pas de pression sur la trachée. Étranglement sanguin : la perte de connaissance peut survenir en quelques secondes. Serrer progressivement, relâcher immédiatement au premier tap ou si le partenaire ne répond plus.', 'document', null, array['V17']::text[], null, '["sys:controle:RNC / étranglement arrière"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N28', 'grappling_nogi', 'grappling_nogi_6', 2, 'Inside Heel Hook (Clé de talon interne)', array['Heel Hook']::text[], 'Depuis le Saddle (4/11) ou le 50/50, immobiliser le genou de l''adversaire entre ses cuisses. Caler son talon dans le creux de votre poignet (pouce vers le haut), coller votre poitrine sur sa cheville et effectuer une rotation contrôlée en arquant le dos.', 'Depuis le Saddle (N32) ou le Backside 50/50 (N33) : genou de l''adversaire bloqué entre vos cuisses, genoux serrés. Son talon calé dans le creux du poignet, ses orteils coincés sous votre aisselle, mains jointes paume contre paume. Rotation lente du buste qui entraîne le talon, sans à-coup. Sécurité : application très lente, arrêt au premier tap. Le partenaire doit taper tôt, car la douleur arrive souvent après la lésion. Réservée aux pratiquants avancés, et seulement dans les règles et catégories qui l''autorisent.', 'document', null, array['V18','S1']::text[], 'cles_talon', '["sys:jambes:Clés de talon / cheville / genou"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N29', 'grappling_nogi', 'grappling_nogi_6', 3, 'Guillotine (High Elbow) et Darce Choke', array['Guillotine','Darce']::text[], 'Sur un adversaire qui baisse la tête, envelopper sa nuque en remontant le coude très haut sur son dos (High Elbow Guillotine) pour bloquer sa sortie. S''il tourne sur le côté pour défendre, glisser le bras sous son aisselle et verrouiller sur votre propre biceps (Darce Choke).', null, 'document', null, '{}'::text[], null, '["sys:controle:Guillotine / Anaconda"]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('N30', 'grappling_nogi', 'grappling_nogi_6', 4, 'Arm Triangle (Kata Gatame)', array['Kata Gatame']::text[], 'Depuis la position montée ou latérale, isoler un bras de l''adversaire en travers de sa propre gorge avec votre épaule. Descendre sur le côté (côté opposé au bras piégé), verrouiller vos mains paume contre paume et mettre la pression de l''épaule en abaissant les hanches.', null, 'document', null, '{}'::text[], null, '[]'::jsonb, 'Programme technique JJB Gi & No-Gi (document fourni par le club)'),
  ('G31', 'jjb_gi', 'jjb_gi_6', 5, 'Omoplata (Clé d''épaule avec les jambes)', '{}'::text[], null, 'Depuis Col-Manche, contrôler la manche, pivoter les hanches et passer la jambe par-dessus son épaule. S''asseoir face à ses jambes, bloquer sa hanche pour l''empêcher de rouler, puis pencher le buste vers l''avant. Sécurité : pression lente, l''épaule cède vite ; si le partenaire roule pour s''échapper, le laisser rouler.', 'proposition', 2, array['F1']::text[], null, '[]'::jsonb, 'Proposition UZU du 17/11/2026 — à valider par un professeur qualifié'),
  ('G32', 'jjb_gi', 'jjb_gi_4', 7, 'Headquarters (Position de départ du passage)', '{}'::text[], null, 'Un genou entre ses jambes, l''autre pied à l''extérieur, contrôle du pantalon et du col. Hanches basses, poids sur la jambe qui écrase sa cuisse. Position d''attente d''où partent le Torreando et le Knee Cut.', 'proposition', 1, array['F2']::text[], null, '[]'::jsonb, 'Proposition UZU du 17/11/2026 — à valider par un professeur qualifié'),
  ('G33', 'jjb_gi', 'jjb_gi_5', 5, 'Passage en montée (Mount)', '{}'::text[], null, 'Depuis le contrôle latéral, garder le Crossface, bloquer sa hanche avec la main, glisser le genou sur son ventre puis le passer de l''autre côté. S''installer genoux serrés contre ses côtes, pieds crochetés sous ses jambes.', 'proposition', 1, array['F2']::text[], null, '["sys:fond:Contrôle latéral et monte"]'::jsonb, 'Proposition UZU du 17/11/2026 — à valider par un professeur qualifié'),
  ('G34', 'jjb_gi', 'jjb_gi_4', 8, 'Smash Pass en kimono', '{}'::text[], null, 'Même principe que N22 : plaquer ses deux jambes au sol, l''une sur l''autre, épaule sur sa hanche, puis contourner. En kimono, tenir le pantalon pour garder les jambes collées. Sécurité : ne pas tordre son genou en écrasant.', 'proposition', 2, array['F2']::text[], null, '[]'::jsonb, 'Proposition UZU du 17/11/2026 — à valider par un professeur qualifié'),
  ('N31', 'grappling_nogi', 'grappling_nogi_2', 7, 'X-Guard', '{}'::text[], null, 'Sous l''adversaire debout : un crochet derrière son genou, l''autre pied sur sa hanche, une main sur sa cheville. Étendre les jambes pour le faire basculer et l''obliger à poser les mains au tapis.', 'proposition', 2, array['F3']::text[], null, '["sys:jambes:Entrées de leglocks"]'::jsonb, 'Proposition UZU du 17/11/2026 — à valider par un professeur qualifié'),
  ('N32', 'grappling_nogi', 'grappling_nogi_2', 8, 'Saddle (4/11, Honey Hole)', array['4/11','Honey Hole','Inside Sankaku']::text[], null, 'Sa jambe entre les tiennes, ta jambe intérieure en travers de sa hanche, ta jambe extérieure par-dessus qui se verrouille derrière ton genou (forme en 4), genoux serrés. Contrôler le talon avant toute rotation. Sécurité : position des clés de talon, réservée aux pratiquants avancés et aux règles qui les autorisent.', 'proposition', 3, array['F3','S1']::text[], 'cles_talon', '["sys:jambes:Ashi garami"]'::jsonb, 'Proposition UZU du 17/11/2026 — à valider par un professeur qualifié'),
  ('N33', 'grappling_nogi', 'grappling_nogi_2', 9, 'Backside 50/50', array['50/50']::text[], null, 'Depuis la 50/50, passer derrière sa jambe pour que son talon soit exposé, contrôler son genou avant d''attaquer. Même sécurité que N32.', 'proposition', 3, array['F3','S1']::text[], 'cles_talon', '["sys:jambes:Ashi garami"]'::jsonb, 'Proposition UZU du 17/11/2026 — à valider par un professeur qualifié'),
  ('N34', 'grappling_nogi', 'grappling_nogi_5', 5, 'Crab Ride sans kimono', array['Crab Ride']::text[], null, 'Assis derrière ses hanches, un crochet à l''intérieur de sa cuisse, contrôle de sa hanche (pas de ceinture en No-Gi). Suivre ses déplacements pour remonter vers son dos. G16 reste la version kimono.', 'proposition', 3, array['F3']::text[], null, '["sys:controle:Back attack"]'::jsonb, 'Proposition UZU du 17/11/2026 — à valider par un professeur qualifié'),
  ('N35', 'grappling_nogi', 'grappling_nogi_5', 6, 'Dagestani Handcuff (Piège du bras en menottes)', array['Handcuff']::text[], null, 'Depuis le côté ou la tortue, saisir un bras de l''adversaire à deux mains pour le bloquer contre lui, puis rouler pour le mettre sur le dos avec le bras piégé, ce qui ouvre l''étranglement tête-bras. Description générale à préciser par un professeur.', 'proposition', 3, array['F4']::text[], null, '[]'::jsonb, 'Proposition UZU du 17/11/2026 — à valider par un professeur qualifié'),
  ('N36', 'grappling_nogi', 'grappling_nogi_5', 7, 'Contrôle latéral Chest-to-Chest (No-Gi)', array['Chest-to-Chest','Side Control']::text[], null, 'Poitrine contre poitrine, bras sous sa nuque ou Crossface, underhook sur le bras éloigné, hanches basses, genoux collés contre lui pour bloquer la langouste.', 'proposition', 1, array['F4']::text[], null, '["sys:fond:Contrôle latéral et monte"]'::jsonb, 'Proposition UZU du 17/11/2026 — à valider par un professeur qualifié')
on conflict (id) do update set discipline_id = excluded.discipline_id, category_id = excluded.category_id, position = excluded.position, name = excluded.name, aliases = excluded.aliases,
  source_text = excluded.source_text, proposed_text = excluded.proposed_text, origin = excluded.origin, level = excluded.level, validation_refs = excluded.validation_refs,
  restricted = excluded.restricted, uzu_links = excluded.uzu_links, source = excluded.source,
  version = case when (lib_techniques.name, lib_techniques.source_text, lib_techniques.proposed_text) is distinct from (excluded.name, excluded.source_text, excluded.proposed_text) then lib_techniques.version + 1 else lib_techniques.version end,
  updated_at = case when (lib_techniques.name, lib_techniques.source_text, lib_techniques.proposed_text) is distinct from (excluded.name, excluded.source_text, excluded.proposed_text) then now() else lib_techniques.updated_at end;

insert into public.lib_flows (id, discipline_id, position, title, intro) values
  ('FC1', 'jjb_gi', 1, 'Le système « Garde Ouverte vers Prise de Dos »', 'En kimono, tout part de la connexion à distance pour forcer l''adversaire à réagir, créant ainsi un accès à son dos.'),
  ('FC2', 'jjb_gi', 2, 'Le système « Passage de Garde en Dilemme »', 'Pour passer une garde moderne en kimono, il faut alterner entre vitesse (contourner) et pression (écraser).'),
  ('FC3', 'grappling_nogi', 3, 'Le système « Garde Assise, Wrestle-Up & Leg Locks »', 'En No-Gi, le joueur du dessous crée un dilemme constant entre le haut du corps (lutte) et le bas du corps (clés de jambes).'),
  ('FC4', 'grappling_nogi', 4, 'Le système « Lutte, Pression & Étranglements Tête-Bras »', 'Le jeu moderne du dessus en No-Gi consiste à fatiguer l''adversaire par la pression constante avant de verrouiller la tête et un bras.')
on conflict (id) do update set discipline_id = excluded.discipline_id, position = excluded.position, title = excluded.title, intro = excluded.intro;

-- Étapes : remplacées en bloc (aucune donnée de club n'y fait référence)
delete from public.lib_flow_steps where flow_id in ('FC1','FC2','FC3','FC4');
insert into public.lib_flow_steps (id, flow_id, position, parent_id, kind, branch_label, label, origin) values
  ('FC1-1', 'FC1', 1, null, 'depart', null, 'Guard Pull vers Collar-Sleeve (Col-Manche).', 'document'),
  ('FC1-2', 'FC1', 2, 'FC1-1', 'action', null, 'Vous menacez le Triangle ou l''Omoplata.', 'document'),
  ('FC1-3', 'FC1', 3, 'FC1-2', 'reaction', null, 'Il recule et redresse sa posture pour défendre le haut du corps.', 'document'),
  ('FC1-4', 'FC1', 4, 'FC1-3', 'transition', null, 'Passage en De La Riva (DLR) en accrochant sa jambe avant.', 'document'),
  ('FC1-5', 'FC1', 5, 'FC1-4', 'action', null, 'Vous déséquilibrez vers l''arrière pour le Tripod Sweep ou le Berimbolo.', 'document'),
  ('FC1-6', 'FC1', 6, 'FC1-5', 'reaction', null, 'Il plie son genou vers l''intérieur pour écraser votre crochet DLR et tenter un Knee Cut Pass.', 'document'),
  ('FC1-7', 'FC1', 7, 'FC1-6', 'transition', null, 'Bascule en Reverse De La Riva (RDLR).', 'document'),
  ('FC1-8', 'FC1', 8, 'FC1-7', 'action', null, 'Vous inversez sous ses hanches (Kiss of the Dragon) pour exposer son dos.', 'document'),
  ('FC1-9', 'FC1', 9, 'FC1-8', 'finalisation', null, 'Prise de dos (Seatbelt + prise de col) → Bow and Arrow Choke.', 'document'),
  ('FC2-1', 'FC2', 1, null, 'depart', null, 'Entrée en position Headquarters (un pied entre ses jambes, contrôle du pantalon et du col).', 'document'),
  ('FC2-2', 'FC2', 2, 'FC2-1', 'action', null, 'Vous lancez un Torreando Pass sur le côté pour contourner les jambes.', 'document'),
  ('FC2-3', 'FC2', 3, 'FC2-2', 'reaction', null, 'Il tourne ses hanches vers vous et lève les jambes pour bloquer votre passage.', 'document'),
  ('FC2-4', 'FC2', 4, 'FC2-3', 'transition', null, 'Changement d''angle vers le Knee Cut Pass à l''opposé (en tirant fort son col pour coller son dos au tapis).', 'document'),
  ('FC2-5', 'FC2', 5, 'FC2-4', 'reaction', null, 'Il insère un bouclier de genou (Knee Shield) ou ferme la demi-garde.', 'document'),
  ('FC2-6', 'FC2', 6, 'FC2-5', 'transition', null, 'Écrasement en Smash Pass ou Over-Under Pass pour neutraliser ses hanches.', 'document'),
  ('FC2-7', 'FC2', 7, 'FC2-6', 'finalisation', null, 'Contrôle latéral (Crossface) → Passage en montée → Cross Collar Choke ou Armbar.', 'document'),
  ('FC3-d', 'FC3', 1, null, 'depart', null, 'Seated Guard (Garde assise) avec bataille de mains (Hand Fighting).', 'document'),
  ('FC3-a1', 'FC3', 2, 'FC3-d', 'action', null, 'Vous attaquez un Arm Drag ou un Butterfly Sweep.', 'document'),
  ('FC3-ra', 'FC3', 3, 'FC3-a1', 'reaction', 'Réaction A : il recule', 'Réaction A (Il recule) : Vous déclenchez un Wrestle-Up (Single Leg) pour le faire tomber et passer au-dessus.', 'document'),
  ('FC3-pa', 'FC3', 4, 'FC3-ra', 'transition', null, 'Après le Wrestle-Up, finir la chute puis passer la garde avec le Body Lock Pass ; s''il tourne le dos pour se relever, Seatbelt puis Rear Naked Choke.', 'proposition'),
  ('FC3-rb', 'FC3', 5, 'FC3-a1', 'reaction', 'Réaction B : il avance et met son poids sur vous', 'Réaction B (Il avance et met son poids sur vous) : Vous glissez sous lui pour entrer en Single Leg X (SLX) ou K-Guard.', 'document'),
  ('FC3-t', 'FC3', 6, 'FC3-rb', 'transition', null, 'Déséquilibre depuis SLX / X-Guard.', 'document'),
  ('FC3-a2', 'FC3', 7, 'FC3-t', 'action', null, 'Vous le forcez à poser les mains au tapis, exposant son talon.', 'document'),
  ('FC3-f', 'FC3', 8, 'FC3-a2', 'finalisation', null, 'Entrée en Saddle (4/11) ou Backside 50/50 → Inside Heel Hook.', 'document'),
  ('FC3-alt', 'FC3', 9, 'FC3-f', 'alternative', 'S''il cache son talon', '(Alternative si il cache son talon :) Vous remontez dans son dos via Crab Ride → Rear Naked Choke.', 'document'),
  ('FC4-d', 'FC4', 1, null, 'depart', null, 'Debout → Snap Down vers Front Headlock.', 'document'),
  ('FC4-r1', 'FC4', 2, 'FC4-d', 'reaction', null, 'Il rentre la tête et baisse les coudes pour éviter la Guillotine.', 'document'),
  ('FC4-t1', 'FC4', 3, 'FC4-r1', 'transition', null, 'Vous contournez vers le dos (Slide By) ou vous le forcez au sol pour passer en Body Lock Pass.', 'document'),
  ('FC4-ps', 'FC4', 4, 'FC4-t1', 'transition', 'Slide By', 'Après le contournement, ceinture arrière, retour au sol, puis Seatbelt + Body Triangle et Rear Naked Choke.', 'proposition'),
  ('FC4-a', 'FC4', 5, 'FC4-t1', 'action', 'Body Lock Pass', 'Vous écrasez ses hanches et passez en contrôle latéral (Chest-to-Chest).', 'document'),
  ('FC4-r2', 'FC4', 6, 'FC4-a', 'reaction', null, 'Il se met sur le côté et pousse avec son bras pour créer de l''espace (langouste).', 'document'),
  ('FC4-t2', 'FC4', 7, 'FC4-r2', 'transition', null, 'Piégeage du bras (Dagestani Handcuff) ou passage en Arm Triangle (Kata Gatame).', 'document'),
  ('FC4-alt', 'FC4', 8, 'FC4-t2', 'alternative', 'S''il tourne le dos pour fuir', '(S''il tourne le dos pour fuir :) Vous verrouillez la Seatbelt + Body Triangle → Rear Naked Choke (à une main).', 'document');

insert into public.lib_flow_step_techniques (step_id, technique_id, position, origin) values
  ('FC1-1', 'G04', 1, 'document'),
  ('FC1-1', 'G06', 2, 'document'),
  ('FC1-2', 'G30', 1, 'document'),
  ('FC1-2', 'G31', 2, 'proposition'),
  ('FC1-4', 'G05', 1, 'document'),
  ('FC1-4', 'G07', 2, 'document'),
  ('FC1-5', 'G12', 1, 'document'),
  ('FC1-5', 'G07', 2, 'document'),
  ('FC1-6', 'G18', 1, 'document'),
  ('FC1-7', 'G10', 1, 'document'),
  ('FC1-8', 'G10', 1, 'document'),
  ('FC1-9', 'G23', 1, 'document'),
  ('FC1-9', 'G27', 2, 'document'),
  ('FC2-1', 'G32', 1, 'proposition'),
  ('FC2-2', 'G17', 1, 'document'),
  ('FC2-4', 'G18', 1, 'document'),
  ('FC2-5', 'G26', 1, 'document'),
  ('FC2-6', 'G20', 1, 'document'),
  ('FC2-6', 'G34', 2, 'proposition'),
  ('FC2-7', 'G24', 1, 'document'),
  ('FC2-7', 'G28', 2, 'document'),
  ('FC2-7', 'G30', 3, 'document'),
  ('FC2-7', 'G33', 4, 'proposition'),
  ('FC3-d', 'N06', 1, 'document'),
  ('FC3-a1', 'N14', 1, 'document'),
  ('FC3-a1', 'N12', 2, 'document'),
  ('FC3-ra', 'N13', 1, 'document'),
  ('FC3-pa', 'N17', 1, 'proposition'),
  ('FC3-pa', 'N23', 2, 'proposition'),
  ('FC3-pa', 'N27', 3, 'proposition'),
  ('FC3-rb', 'N08', 1, 'document'),
  ('FC3-rb', 'N10', 2, 'document'),
  ('FC3-t', 'N08', 1, 'document'),
  ('FC3-t', 'N31', 2, 'proposition'),
  ('FC3-f', 'N28', 1, 'document'),
  ('FC3-f', 'N32', 2, 'proposition'),
  ('FC3-f', 'N33', 3, 'proposition'),
  ('FC3-alt', 'G16', 1, 'document'),
  ('FC3-alt', 'N27', 2, 'document'),
  ('FC3-alt', 'N34', 3, 'proposition'),
  ('FC4-d', 'N01', 1, 'document'),
  ('FC4-r1', 'N29', 1, 'document'),
  ('FC4-t1', 'N05', 1, 'document'),
  ('FC4-t1', 'N17', 2, 'document'),
  ('FC4-ps', 'N04', 1, 'proposition'),
  ('FC4-ps', 'N23', 2, 'proposition'),
  ('FC4-ps', 'N27', 3, 'proposition'),
  ('FC4-a', 'N36', 1, 'proposition'),
  ('FC4-t2', 'N30', 1, 'document'),
  ('FC4-t2', 'N35', 2, 'proposition'),
  ('FC4-alt', 'N23', 1, 'document'),
  ('FC4-alt', 'N27', 2, 'document');

commit;

-- Contrôle : doit afficher 12 tables, 3 disciplines, 12 catégories, 70 fiches (60 du document),
-- 4 enchaînements, 33 étapes et la ressource « library » dans le catalogue des droits
select (select count(*) from pg_tables where schemaname = 'public' and (tablename like 'lib\_%' or tablename like 'club\_lib\_%')) as tables_ajoutees,
       (select count(*) from public.lib_disciplines) as disciplines,
       (select count(*) from public.lib_categories) as categories,
       (select count(*) from public.lib_techniques) as fiches,
       (select count(*) from public.lib_techniques where origin = 'document') as fiches_du_document,
       (select count(*) from public.lib_flows) as enchainements,
       (select count(*) from public.lib_flow_steps) as etapes,
       public.uzu_perm_catalog() ? 'library' as droit_bibliotheque;
