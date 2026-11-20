-- =====================================================================================
-- UZU — Class Media : photos et vidéos privées des séances (structure, droits, stockage)
-- Branche media/class-media. À lancer UNIQUEMENT sur la base de test (ntypsrdwxrkanahhuixx),
-- après uzu-9, uzu-10, uzu-11 et uzu-12, et après le contrôle préalable (uzu-13-controle-prealable.sql).
--
-- Aucune donnée existante n'est supprimée. Le stockage « vidéos pédagogiques » n'est pas touché :
-- aucune règle de ce script ne le concerne, et aucune règle de stockage de ce script ne contient le mot
-- qui désigne cet espace (le script uzu-retour-1 efface les règles qui le contiennent).
--
-- Modifie trois éléments existants, sans changer leur signature (plan validé, V1) :
--   1. la règle de lecture de class_session_media (plus stricte) ;
--   2. journal_feed : le compteur « media » ne compte plus que les médias visibles ;
--   3. uzu_perm_catalog : ajout du droit « minor_groups · update » (V4), déclarée stable (voir section 2) ;
--      uzu_check_grant est redéclarée à l'identique pour que les connexions ouvertes voient le nouveau droit.
-- Les modèles de droits (uzu_perm_template) ne changent pas : le droit n'est donné par défaut
-- qu'au responsable du club, qui a déjà tous les droits.
--
-- Rejouable. S'arrête sans rien changer si class_session_media contient déjà des lignes alors que
-- ses nouvelles colonnes n'existent pas (situation imprévue). Retour arrière : bloc commenté en fin.
-- =====================================================================================
begin;

do $$ begin
  if exists (select 1 from public.class_session_media)
     and not exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'class_session_media' and column_name = 'state') then
    raise exception 'class_session_media contient des lignes : arrêt, aucune modification faite';
  end if;
end $$;

-- -----------------------------------------------------------------------------------------
-- 1. Colonnes et tables
-- -----------------------------------------------------------------------------------------
alter table public.academy_sections add column if not exists minors boolean not null default false;

alter table public.class_session_media
  add column if not exists position           smallint not null default 0,
  add column if not exists state              text not null default 'uploading',
  add column if not exists location           text not null default 'pending',
  add column if not exists validation         text not null default 'pending_validation',
  add column if not exists mime_declared      text,
  add column if not exists mime_detected      text,
  add column if not exists size_bytes         bigint,
  add column if not exists uploaded_by        uuid references auth.users (id) on delete set null,
  add column if not exists reserved_until     timestamptz,
  add column if not exists ready_at           timestamptz,
  add column if not exists minors_declared_at timestamptz,
  add column if not exists minors_declared_by uuid references auth.users (id) on delete set null,
  add column if not exists validated_by       uuid references auth.users (id) on delete set null,
  add column if not exists validated_at       timestamptz,
  add column if not exists validation_note    text,
  add column if not exists quarantine_path    text,
  add column if not exists quarantine_reason  text,
  add column if not exists quarantined_at     timestamptz,
  add column if not exists verify_error       text,
  add column if not exists deleted_at         timestamptz,
  add column if not exists deleted_reason     text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'class_session_media_cm_check') then
    alter table public.class_session_media add constraint class_session_media_cm_check check (
          state in ('uploading','ready','quarantined','deleted')
      and location in ('pending','main','quarantine','none')
      and validation in ('pending_validation','approved','rejected')
      and (mime_declared is null or mime_declared in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'))
      and (mime_detected is null or mime_detected in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'))
      and (size_bytes is null or size_bytes between 1 and 52428800)
      and (validation_note is null or length(validation_note) <= 500)
      and (quarantine_reason is null or quarantine_reason in ('session_unpublished','removed_by_team','removal_request'))
      and (deleted_reason is null or deleted_reason in ('reservation_expired','verification_failed','removed_by_team','request_completed','expired','session_purged'))
      and (verify_error is null or length(verify_error) <= 200)
      and (quarantine_path is null or length(quarantine_path) between 1 and 300));
  end if;
end $$;
create index if not exists class_session_media_session_idx on public.class_session_media (session_id, position);
create index if not exists class_session_media_state_idx on public.class_session_media (state, location);

create table if not exists public.class_media_settings (
  id                      boolean primary key default true check (id),
  media_retention_months  int not null default 12      check (media_retention_months between 1 and 120),
  log_retention_months    int not null default 36      check (log_retention_months between 1 and 120),
  quarantine_days         int not null default 7       check (quarantine_days between 1 and 90),
  ticket_seconds          int not null default 900     check (ticket_seconds between 30 and 900),
  chunk_bytes             int not null default 2097152 check (chunk_bytes between 262144 and 4194304),
  max_per_session         int not null default 4       check (max_per_session between 1 and 10),
  max_bytes               bigint not null default 52428800 check (max_bytes between 1048576 and 52428800),
  reservation_minutes     int not null default 30      check (reservation_minutes between 5 and 120),
  updated_at              timestamptz not null default now(),
  updated_by              uuid references auth.users (id) on delete set null
);
insert into public.class_media_settings (id) values (true) on conflict (id) do nothing;

-- Jetons de lecture : seule l'empreinte SHA-256 est gardée, jamais le jeton
create table if not exists public.class_media_tickets (
  token_hash  text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id     uuid not null references auth.users (id) on delete cascade,
  media_id    uuid not null references public.class_session_media (id) on delete cascade,
  academy_id  uuid not null references public.clubs (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
create index if not exists class_media_tickets_media_idx on public.class_media_tickets (media_id);
create index if not exists class_media_tickets_user_idx on public.class_media_tickets (user_id, created_at);

create table if not exists public.class_media_removal_requests (
  id            uuid primary key default gen_random_uuid(),
  media_id      uuid not null references public.class_session_media (id) on delete cascade,
  academy_id    uuid not null references public.clubs (id) on delete cascade,
  session_id    uuid not null references public.class_sessions (id) on delete cascade,
  requested_by  uuid references auth.users (id) on delete set null,
  reason        text not null default '' check (length(reason) <= 500),
  status        text not null default 'requested' check (status in ('requested','processing','completed','rejected')),
  handled_by    uuid references auth.users (id) on delete set null,
  handled_at    timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 500),
  created_at    timestamptz not null default now()
);
create index if not exists class_media_requests_media_idx on public.class_media_removal_requests (media_id, status);
create index if not exists class_media_requests_academy_idx on public.class_media_removal_requests (academy_id, status, created_at);

alter table public.class_media_settings         enable row level security;
alter table public.class_media_tickets          enable row level security;
alter table public.class_media_removal_requests enable row level security;
revoke all on public.class_media_settings, public.class_media_tickets, public.class_media_removal_requests from anon, authenticated;

-- -----------------------------------------------------------------------------------------
-- 2. Droit « Groupes de mineurs » (V4) : le reste du catalogue est inchangé
-- -----------------------------------------------------------------------------------------
-- Déclarée « stable » et non plus « immutable » : une valeur immutable est figée dans les plans déjà
-- préparés par les connexions ouvertes, qui ignoreraient le nouveau droit jusqu'à leur fermeture.
create or replace function public.uzu_perm_catalog() returns jsonb
language sql stable as $$ select '{
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
  "class_journal":      {"actions":["view","create","update","approve"],   "scopes":["academy","section","assigned_courses"]},
  "minor_groups":       {"actions":["update"],                             "scopes":["academy"]}
}'::jsonb $$;

-- Redéclarée À L'IDENTIQUE (texte de uzu-2) : oblige chaque connexion ouverte à recompiler cette
-- fonction, qui sinon garderait l'ancien catalogue dans ses plans préparés. Aucun changement de comportement.
create or replace function public.uzu_check_grant(p_academy uuid, p_perms jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e jsonb; v_r text; v_a text; v_s text; v_eff text; v_mine text; v_owner boolean; v_out jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_perms) <> 'array' then raise exception 'Liste de droits invalide'; end if;
  if jsonb_array_length(p_perms) > 200 then raise exception 'Trop de droits'; end if;
  v_owner := (public.uzu_staff_member(p_academy)).role = 'owner';
  for e in select * from jsonb_array_elements(p_perms) loop
    v_r := e->>'r'; v_a := e->>'a'; v_s := coalesce(e->>'s', 'academy'); v_eff := coalesce(e->>'e', 'allow');
    if v_eff not in ('allow','deny') or not public.uzu_perm_valid(v_r, v_a, v_s) then
      raise exception 'Droit invalide : % / % / %', v_r, v_a, v_s; end if;
    if not v_owner and v_eff = 'allow' then
      v_mine := public.uzu_perm_scope(p_academy, v_r, v_a);
      if v_mine is null or (v_mine <> v_s and public.uzu_scope_rank(v_mine) <= public.uzu_scope_rank(v_s)) then
        raise exception 'Tu ne peux pas accorder un droit que tu n''as pas : % / %', v_r, v_a; end if;
    end if;
    v_out := v_out || jsonb_build_object('r', v_r, 'a', v_a, 's', v_s, 'e', v_eff);
  end loop;
  return v_out;
end $$;

-- -----------------------------------------------------------------------------------------
-- 3. Fonctions d'aide (lues par les règles et les fonctions ci-dessous)
-- -----------------------------------------------------------------------------------------
create or replace function public.class_media_cfg() returns public.class_media_settings
language sql stable security definer set search_path = public as $$
  select * from public.class_media_settings where id limit 1
$$;

-- Équipe pouvant consulter la séance (auteur ou droit « consulter » du Journal sur ce groupe ou ce cours)
create or replace function public.uzu_media_staff_view(p_s public.class_sessions) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.uzu_staff_member(p_s.academy_id)).id is not null
     and (p_s.author_id = auth.uid() or public.uzu_can_journal(p_s.academy_id, 'view', p_s.section_id, p_s.course_key))
$$;
-- Peut ajouter ou retirer un média : même règle que « Modifier » la séance (journal_feed.can_edit)
create or replace function public.uzu_media_can_edit(p_s public.class_sessions) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.uzu_staff_member(p_s.academy_id)).id is not null and (
         (p_s.author_id = auth.uid() and public.uzu_can_journal(p_s.academy_id, 'create', p_s.section_id, p_s.course_key))
      or public.uzu_can_journal(p_s.academy_id, 'update', p_s.section_id, p_s.course_key))
$$;
-- Peut valider, traiter une demande, rétablir : droit « Publier » du Journal sur ce groupe ou ce cours
create or replace function public.uzu_media_can_approve(p_s public.class_sessions) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (public.uzu_staff_member(p_s.academy_id)).id is not null
     and public.uzu_can_journal(p_s.academy_id, 'approve', p_s.section_id, p_s.course_key)
$$;

-- Visible par l'utilisateur connecté, à cet instant (lecture du fichier)
--   adhérent : séance publiée de son groupe, fichier vérifié et en place, validé, aucune demande de retrait ouverte ;
--   équipe autorisée : fichier vérifié et en place (y compris en attente ou refusé, pour décider),
--   et fichier en quarantaine pour qui peut valider ou rétablir.
create or replace function public.uzu_media_visible(p_m public.class_session_media) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_s public.class_sessions;
begin
  if auth.uid() is null or p_m.id is null then return false; end if;
  select * into v_s from public.class_sessions where id = p_m.session_id;
  if v_s.id is null or v_s.academy_id <> p_m.academy_id then return false; end if;
  if public.uzu_media_staff_view(v_s) then
    return (p_m.state = 'ready' and p_m.location = 'main')
        or (p_m.state = 'quarantined' and p_m.location = 'quarantine' and public.uzu_media_can_approve(v_s));
  end if;
  return p_m.state = 'ready' and p_m.location = 'main' and p_m.validation = 'approved'
     and v_s.status = 'publie' and v_s.section_id = any (public.uzu_my_groups(v_s.academy_id))
     and not exists (select 1 from public.class_media_removal_requests r
                      where r.media_id = p_m.id and r.status in ('requested','processing'));
end $$;

-- Ligne lisible (règle de la table) : équipe autorisée = tout ; adhérent = médias visibles
create or replace function public.uzu_media_row_readable(p_m public.class_session_media) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_s public.class_sessions;
begin
  if auth.uid() is null then return false; end if;
  select * into v_s from public.class_sessions where id = p_m.session_id;
  if v_s.id is null then return false; end if;
  return public.uzu_media_staff_view(v_s) or public.uzu_media_visible(p_m);
end $$;

-- Règle d'envoi du stockage : seulement à l'emplacement réservé par l'utilisateur, pendant la réservation
create or replace function public.uzu_media_upload_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.class_session_media m
     where m.storage_path = p_name and m.state = 'uploading' and m.location = 'pending'
       and m.uploaded_by = auth.uid() and m.reserved_until > now())
$$;

create or replace function public.uzu_media_revoke(p_media uuid) returns int
language sql security definer set search_path = public as $$
  with u as (update public.class_media_tickets set revoked_at = now()
              where media_id = p_media and revoked_at is null returning 1)
  select count(*)::int from u
$$;

-- -----------------------------------------------------------------------------------------
-- 4. Règle de lecture de class_session_media, plus stricte (V1, même nom)
-- -----------------------------------------------------------------------------------------
drop policy if exists uzu_class_session_media_select on public.class_session_media;
create policy uzu_class_session_media_select on public.class_session_media for select to authenticated
  using (public.uzu_media_row_readable(class_session_media));

-- -----------------------------------------------------------------------------------------
-- 5. journal_feed : compteur des seuls médias visibles (signature et reste inchangés)
-- -----------------------------------------------------------------------------------------
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
      'media', (select count(*) from public.class_session_media md where md.session_id = s.id and public.uzu_media_visible(md)),
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

-- -----------------------------------------------------------------------------------------
-- 6. Fonctions appelées par l'application (compte de l'utilisateur)
-- -----------------------------------------------------------------------------------------
-- Médias d'une séance, selon les droits. Aucun chemin de fichier n'est renvoyé.
create or replace function public.session_media(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_s public.class_sessions; v_c public.class_media_settings := public.class_media_cfg();
        v_staff boolean; v_edit boolean; v_appr boolean; v_minors boolean;
begin
  select * into v_s from public.class_sessions where id = p_session;
  if v_s.id is null or not public.uzu_journal_readable(v_s) then raise exception 'Séance introuvable'; end if;
  v_staff := public.uzu_media_staff_view(v_s); v_edit := public.uzu_media_can_edit(v_s); v_appr := public.uzu_media_can_approve(v_s);
  select coalesce(minors, false) into v_minors from public.academy_sections where id = v_s.section_id;
  return jsonb_build_object(
    'max', v_c.max_per_session, 'max_bytes', v_c.max_bytes, 'minors', coalesce(v_minors, false),
    'can_add', v_edit, 'can_validate', v_appr,
    'used', (select count(*) from public.class_session_media m where m.session_id = v_s.id
              and (m.state in ('ready','quarantined') or (m.state = 'uploading' and m.reserved_until > now())))::int,
    'items', coalesce((select jsonb_agg(x order by (x->>'position')::int, x->>'created_at') from (
      select case when v_staff then jsonb_build_object(
               'id', m.id, 'kind', m.kind, 'position', m.position, 'state', m.state, 'location', m.location,
               'validation', m.validation, 'mime', coalesce(m.mime_detected, m.mime_declared), 'size', m.size_bytes,
               'created_at', m.created_at, 'quarantine_reason', m.quarantine_reason, 'verify_error', m.verify_error,
               'mine', m.uploaded_by = v_uid,
               'viewable', public.uzu_media_visible(m),
               'can_remove', v_edit and m.state in ('ready','uploading'),
               'can_handle', v_appr,
               'can_validate', v_appr and m.state = 'ready' and m.validation = 'pending_validation',
               'can_restore', v_appr and m.state = 'quarantined' and coalesce(m.quarantine_reason, '') <> 'session_unpublished'
                              and not exists (select 1 from public.class_media_removal_requests r where r.media_id = m.id and r.status in ('requested','processing')),
               'request', (select jsonb_build_object('id', r.id, 'status', r.status, 'reason', r.reason, 'created_at', r.created_at)
                             from public.class_media_removal_requests r where r.media_id = m.id order by r.created_at desc limit 1))
             else jsonb_build_object('id', m.id, 'kind', m.kind, 'position', m.position, 'created_at', m.created_at, 'viewable', true) end as x
        from public.class_session_media m
       where m.session_id = v_s.id and m.state <> 'deleted'
         and (v_staff or public.uzu_media_visible(m))
         and not (m.state = 'uploading' and m.reserved_until <= now())) q), '[]'::jsonb));
end $$;

-- Jeton de lecture (15 min au plus). Renvoyé une seule fois ; seule son empreinte est gardée.
create or replace function public.media_ticket(p_media uuid, p_seconds int default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_m public.class_session_media; v_c public.class_media_settings := public.class_media_cfg();
        v_tok text; v_sec int;
begin
  select * into v_m from public.class_session_media where id = p_media;
  if v_m.id is null or not public.uzu_media_visible(v_m) then raise exception 'Média indisponible'; end if;
  if (select count(*) from public.class_media_tickets where user_id = v_uid and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Trop de demandes, réessaie dans quelques minutes'; end if;
  v_sec := least(v_c.ticket_seconds, greatest(30, coalesce(p_seconds, v_c.ticket_seconds)));
  v_tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.class_media_tickets (token_hash, user_id, media_id, academy_id, expires_at)
  values (encode(sha256(convert_to(v_tok, 'UTF8')), 'hex'), v_uid, v_m.id, v_m.academy_id, now() + make_interval(secs => v_sec));
  return jsonb_build_object('token', v_tok, 'expires_in', v_sec, 'kind', v_m.kind, 'mime', coalesce(v_m.mime_detected, v_m.mime_declared), 'size', v_m.size_bytes);
end $$;

-- Réserver une place (V5 : séance déjà enregistrée). Séance verrouillée pendant le comptage.
create or replace function public.media_reserve(p_session uuid, p_kind text, p_mime text, p_size bigint, p_rights boolean, p_minors boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_s public.class_sessions; v_c public.class_media_settings := public.class_media_cfg();
        v_minors boolean; v_n int; v_id uuid := gen_random_uuid(); v_ext text; v_path text; v_q text; v_pos int;
begin
  select * into v_s from public.class_sessions where id = p_session for update;
  if v_s.id is null then raise exception 'Enregistre d''abord la séance (au moins en brouillon)'; end if;
  if not public.uzu_media_can_edit(v_s) then raise exception 'Droit requis : modifier cette séance'; end if;
  if p_kind not in ('photo','video') then raise exception 'Type de média inconnu'; end if;
  if (p_kind = 'photo' and p_mime not in ('image/jpeg','image/png','image/webp'))
     or (p_kind = 'video' and p_mime not in ('video/mp4','video/webm','video/quicktime')) then
    raise exception 'Format non accepté : photo JPG, PNG ou WebP ; vidéo MP4, WebM ou MOV'; end if;
  if p_size is null or p_size < 1 or p_size > v_c.max_bytes then raise exception 'Fichier trop lourd : 50 Mo au plus'; end if;
  if p_rights is not true then raise exception 'Confirme l''accord des personnes visibles et des représentants légaux des mineurs'; end if;
  select coalesce(minors, false) into v_minors from public.academy_sections where id = v_s.section_id;
  if coalesce(v_minors, false) and p_minors is not true then
    raise exception 'Groupe de mineurs : confirme que les autorisations écrites des représentants légaux ont été recueillies'; end if;
  select count(*) into v_n from public.class_session_media m where m.session_id = v_s.id
     and (m.state in ('ready','quarantined') or (m.state = 'uploading' and m.reserved_until > now()));
  if v_n >= v_c.max_per_session then raise exception 'Limite atteinte : % médias par séance', v_c.max_per_session; end if;
  v_ext := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
                       when 'video/mp4' then 'mp4' when 'video/webm' then 'webm' else 'mov' end;
  v_path := v_s.academy_id::text || '/' || v_s.id::text || '/' || v_id::text || '.' || v_ext;
  v_q := v_s.academy_id::text || '/' || v_id::text || '.' || v_ext;
  select coalesce(max(position), 0) + 1 into v_pos from public.class_session_media where session_id = v_s.id;
  insert into public.class_session_media (id, session_id, academy_id, kind, storage_path, quarantine_path, rights_declared_at, rights_declared_by,
        position, state, location, validation, mime_declared, size_bytes, uploaded_by, reserved_until, minors_declared_at, minors_declared_by)
  values (v_id, v_s.id, v_s.academy_id, p_kind, v_path, v_q, now(), v_uid, v_pos, 'uploading', 'pending', 'pending_validation',
          p_mime, p_size, v_uid, now() + make_interval(mins => v_c.reservation_minutes),
          case when coalesce(v_minors, false) then now() end, case when coalesce(v_minors, false) then v_uid end);
  perform public.uzu_journal_event(v_s.academy_id, v_s.id, 'media.reserved', jsonb_build_object('media', v_id, 'kind', p_kind, 'size', p_size,
          'rights_confirmed', true, 'minors_group', coalesce(v_minors, false), 'minors_confirmed', coalesce(v_minors, false)));
  -- Le chemin n'est renvoyé qu'à l'auteur de l'envoi (membre de l'équipe), pour l'envoi direct au stockage
  return jsonb_build_object('id', v_id, 'bucket', 'class-media', 'path', v_path, 'expires_in', v_c.reservation_minutes * 60);
end $$;

-- Valider ou refuser un média (groupe de mineurs, D4)
create or replace function public.media_validate(p_media uuid, p_decision text, p_note text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_m public.class_session_media; v_s public.class_sessions;
begin
  select * into v_m from public.class_session_media where id = p_media for update;
  select * into v_s from public.class_sessions where id = v_m.session_id;
  if v_m.id is null or v_s.id is null or not public.uzu_media_can_approve(v_s) then raise exception 'Droit requis : publier les séances de ce groupe'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Décision inconnue'; end if;
  if v_m.state <> 'ready' or v_m.validation <> 'pending_validation' then raise exception 'Ce média n''attend pas de validation'; end if;
  update public.class_session_media set validation = p_decision, validated_by = v_uid, validated_at = now(),
         validation_note = nullif(left(btrim(coalesce(p_note, '')), 500), '') where id = v_m.id;
  perform public.uzu_media_revoke(v_m.id);
  perform public.uzu_journal_event(v_s.academy_id, v_s.id, 'media.' || p_decision, jsonb_build_object('media', v_m.id));
  return true;
end $$;

-- Retrait par l'équipe : accès coupé tout de suite, quarantaine (7 jours par défaut, V2), puis effacement
create or replace function public.media_remove(p_media uuid, p_reason text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_m public.class_session_media; v_s public.class_sessions;
begin
  select * into v_m from public.class_session_media where id = p_media for update;
  select * into v_s from public.class_sessions where id = v_m.session_id;
  if v_m.id is null or v_s.id is null or not public.uzu_media_can_edit(v_s) then raise exception 'Droit requis : modifier cette séance'; end if;
  if v_m.state = 'uploading' then
    update public.class_session_media set state = 'deleted', deleted_at = now(), deleted_reason = 'removed_by_team' where id = v_m.id;
  elsif v_m.state = 'ready' then
    update public.class_session_media set state = 'quarantined', quarantine_reason = 'removed_by_team', quarantined_at = now() where id = v_m.id;
  else raise exception 'Média déjà retiré'; end if;
  perform public.uzu_media_revoke(v_m.id);
  perform public.uzu_journal_event(v_s.academy_id, v_s.id, 'media.removed', jsonb_build_object('media', v_m.id, 'reason', nullif(left(btrim(coalesce(p_reason, '')), 200), '')));
  return true;
end $$;

-- Demande de retrait par une personne qui voit le média (D6) : masqué aussitôt, équipe prévenue
create or replace function public.media_request_removal(p_media uuid, p_reason text) returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_m public.class_session_media; v_s public.class_sessions; v_id uuid; v_u uuid;
begin
  select * into v_m from public.class_session_media where id = p_media for update;
  if v_m.id is null or not public.uzu_media_visible(v_m) then raise exception 'Média indisponible'; end if;
  select * into v_s from public.class_sessions where id = v_m.session_id;
  select id into v_id from public.class_media_removal_requests where media_id = v_m.id and status in ('requested','processing') limit 1;
  if v_id is null then
    insert into public.class_media_removal_requests (media_id, academy_id, session_id, requested_by, reason)
    values (v_m.id, v_m.academy_id, v_m.session_id, v_uid, left(btrim(coalesce(p_reason, '')), 500)) returning id into v_id;
  end if;
  update public.class_session_media set state = 'quarantined', quarantine_reason = 'removal_request', quarantined_at = now()
   where id = v_m.id and state = 'ready';
  perform public.uzu_media_revoke(v_m.id);
  perform public.uzu_journal_event(v_s.academy_id, v_s.id, 'media.removal_requested', jsonb_build_object('media', v_m.id, 'request', v_id));
  for v_u in select user_id from public.uzu_staff_with(v_s.academy_id, 'class_journal', array['approve']) loop
    perform public.uzu_notify(v_u, 'media_removal', 'Demande de retrait d''un média',
      'Un média de la séance « ' || v_s.theme || ' » a été masqué à la demande d''une personne du groupe. À traiter dans le Journal des cours.',
      '/', 'media-removal-' || v_id::text);
  end loop;
  return v_id;
end $$;

-- Traiter une demande : processing, completed (effacement définitif), rejected (le média reste en quarantaine)
create or replace function public.media_handle_request(p_request uuid, p_status text, p_note text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_r public.class_media_removal_requests; v_s public.class_sessions;
begin
  select * into v_r from public.class_media_removal_requests where id = p_request for update;
  select * into v_s from public.class_sessions where id = v_r.session_id;
  if v_r.id is null or v_s.id is null or not public.uzu_media_can_approve(v_s) then raise exception 'Droit requis : publier les séances de ce groupe'; end if;
  if p_status not in ('processing','completed','rejected') then raise exception 'Statut inconnu'; end if;
  if v_r.status in ('completed','rejected') then raise exception 'Demande déjà traitée'; end if;
  update public.class_media_removal_requests set status = p_status, handled_by = v_uid, handled_at = now(),
         decision_note = nullif(left(btrim(coalesce(p_note, '')), 500), '') where id = v_r.id;
  if p_status = 'completed' then
    update public.class_session_media set state = 'deleted', deleted_at = now(), deleted_reason = 'request_completed' where id = v_r.media_id;
  end if;
  perform public.uzu_media_revoke(v_r.media_id);
  perform public.uzu_journal_event(v_s.academy_id, v_s.id, 'media.request_' || p_status, jsonb_build_object('media', v_r.media_id, 'request', v_r.id));
  return true;
end $$;

-- Rétablir un média en quarantaine : jamais automatique, nouvelles confirmations exigées
create or replace function public.media_restore(p_media uuid, p_rights boolean, p_minors boolean, p_note text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_m public.class_session_media; v_s public.class_sessions; v_minors boolean;
begin
  select * into v_m from public.class_session_media where id = p_media for update;
  select * into v_s from public.class_sessions where id = v_m.session_id;
  if v_m.id is null or v_s.id is null or not public.uzu_media_can_approve(v_s) then raise exception 'Droit requis : publier les séances de ce groupe'; end if;
  if v_m.state <> 'quarantined' or v_m.quarantine_reason = 'session_unpublished' then raise exception 'Ce média ne peut pas être rétabli ainsi'; end if;
  if exists (select 1 from public.class_media_removal_requests where media_id = v_m.id and status in ('requested','processing')) then
    raise exception 'Une demande de retrait est en cours : traite-la d''abord'; end if;
  if p_rights is not true then raise exception 'Confirme l''accord des personnes visibles et des représentants légaux des mineurs'; end if;
  select coalesce(minors, false) into v_minors from public.academy_sections where id = v_s.section_id;
  if coalesce(v_minors, false) and p_minors is not true then raise exception 'Groupe de mineurs : confirme les autorisations écrites des représentants légaux'; end if;
  update public.class_session_media set state = 'ready', quarantine_reason = null, quarantined_at = null,
         validation = 'approved', validated_by = v_uid, validated_at = now(), validation_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
         rights_declared_at = now(), rights_declared_by = v_uid,
         minors_declared_at = case when coalesce(v_minors, false) then now() else minors_declared_at end,
         minors_declared_by = case when coalesce(v_minors, false) then v_uid else minors_declared_by end
   where id = v_m.id;
  perform public.uzu_journal_event(v_s.academy_id, v_s.id, 'media.restored', jsonb_build_object('media', v_m.id, 'rights_confirmed', true, 'minors_confirmed', coalesce(v_minors, false)));
  return true;
end $$;

-- « Groupe de mineurs » (V4) ; en le cochant, tous les médias du groupe repassent en attente (V3)
create or replace function public.set_section_minors(p_section uuid, p_minors boolean) returns int
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v_n int := 0; v_id uuid;
begin
  if v_a is null or not public.uzu_can(v_a, 'minor_groups', 'update') then raise exception 'Droit requis : groupes de mineurs'; end if;
  if not exists (select 1 from public.academy_sections where id = p_section and academy_id = v_a) then raise exception 'Groupe inconnu'; end if;
  update public.academy_sections set minors = coalesce(p_minors, false) where id = p_section;
  if coalesce(p_minors, false) then
    for v_id in select m.id from public.class_session_media m join public.class_sessions s on s.id = m.session_id
                 where s.section_id = p_section and s.academy_id = v_a and m.state <> 'deleted' and m.validation = 'approved' loop
      update public.class_session_media set validation = 'pending_validation', validated_by = null, validated_at = null where id = v_id;
      perform public.uzu_media_revoke(v_id); v_n := v_n + 1;
    end loop;
  end if;
  perform public.uzu_audit(v_a, 'section.minors', 'section', p_section::text, jsonb_build_object('minors', coalesce(p_minors, false), 'media_to_validate', v_n));
  return v_n;
end $$;

create or replace function public.section_minors_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_a uuid := public.uzu_active_academy();
begin
  perform public.uzu_require_auth();
  if v_a is null or (public.uzu_staff_member(v_a)).id is null then raise exception 'Réservé à l''équipe du club'; end if;
  return jsonb_build_object('can_update', public.uzu_can(v_a, 'minor_groups', 'update'),
    'sections', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'minors', s.minors) order by s.name)
                            from public.academy_sections s where s.academy_id = v_a), '[]'::jsonb));
end $$;

-- File « À traiter » : médias à valider et demandes de retrait, sur les groupes où l'on peut publier
create or replace function public.media_queue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_a uuid := public.uzu_active_academy();
begin
  perform public.uzu_require_auth();
  if v_a is null or (public.uzu_staff_member(v_a)).id is null then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('type', 'validation', 'media', m.id, 'session', s.id, 'session_date', s.session_date, 'theme', s.theme,
             'group', s.group_name, 'kind', m.kind, 'at', m.ready_at) x
        from public.class_session_media m join public.class_sessions s on s.id = m.session_id
       where s.academy_id = v_a and m.state = 'ready' and m.validation = 'pending_validation' and public.uzu_media_can_approve(s)
      union all
      select jsonb_build_object('type', 'request', 'media', r.media_id, 'request', r.id, 'status', r.status, 'reason', r.reason,
             'session', s.id, 'session_date', s.session_date, 'theme', s.theme, 'group', s.group_name, 'kind', m.kind, 'at', r.created_at)
        from public.class_media_removal_requests r join public.class_sessions s on s.id = r.session_id join public.class_session_media m on m.id = r.media_id
       where r.academy_id = v_a and r.status in ('requested','processing') and public.uzu_media_can_approve(s)) q), '[]'::jsonb);
end $$;

-- Paramètres (D5) : lecture par l'équipe, modification par un administrateur UZU
create or replace function public.class_media_settings_get() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(c) - 'id' - 'updated_by' from public.class_media_settings c where c.id
$$;
create or replace function public.class_media_settings_set(p jsonb) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth();
begin
  if not public.uzu_is_platform_admin() then raise exception 'Réservé à l''administration UZU'; end if;
  update public.class_media_settings set
    media_retention_months = coalesce((p->>'media_retention_months')::int, media_retention_months),
    log_retention_months   = coalesce((p->>'log_retention_months')::int, log_retention_months),
    quarantine_days        = coalesce((p->>'quarantine_days')::int, quarantine_days),
    ticket_seconds         = coalesce((p->>'ticket_seconds')::int, ticket_seconds),
    chunk_bytes            = coalesce((p->>'chunk_bytes')::int, chunk_bytes),
    max_per_session        = coalesce((p->>'max_per_session')::int, max_per_session),
    reservation_minutes    = coalesce((p->>'reservation_minutes')::int, reservation_minutes),
    updated_at = now(), updated_by = v_uid
  where id;
  return true;
end $$;

-- -----------------------------------------------------------------------------------------
-- 7. Fonctions réservées au rôle serveur (fonction class-media, clé de service côté Supabase)
-- -----------------------------------------------------------------------------------------
-- Contrôle d'une requête de lecture. Appelée à CHAQUE requête (chaque morceau de vidéo).
-- Applique les règles existantes au titulaire du jeton : identité fixée pour la seule transaction.
create or replace function public.media_stream_check(p_token_hash text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_t public.class_media_tickets; v_m public.class_session_media; v_ok boolean; v_c public.class_media_settings := public.class_media_cfg();
        v_prev_sub text := current_setting('request.jwt.claim.sub', true); v_prev_claims text := current_setting('request.jwt.claims', true);
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('ok', false, 'code', 'invalid'); end if;
  select * into v_t from public.class_media_tickets where token_hash = p_token_hash;
  if v_t.token_hash is null then return jsonb_build_object('ok', false, 'code', 'unknown'); end if;
  if v_t.revoked_at is not null then return jsonb_build_object('ok', false, 'code', 'revoked'); end if;
  if v_t.expires_at <= now() then return jsonb_build_object('ok', false, 'code', 'expired'); end if;
  select * into v_m from public.class_session_media where id = v_t.media_id;
  if v_m.id is null or v_m.academy_id <> v_t.academy_id then return jsonb_build_object('ok', false, 'code', 'gone'); end if;
  perform set_config('request.jwt.claim.sub', v_t.user_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_t.user_id, 'role', 'authenticated')::text, true);
  v_ok := public.uzu_media_visible(v_m);
  perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  if not v_ok then
    update public.class_media_tickets set revoked_at = now() where token_hash = p_token_hash;
    return jsonb_build_object('ok', false, 'code', 'denied');
  end if;
  return jsonb_build_object('ok', true, 'media', v_m.id, 'kind', v_m.kind,
    'bucket', case when v_m.location = 'quarantine' then 'class-media-quarantine' else 'class-media' end,
    'path', case when v_m.location = 'quarantine' then v_m.quarantine_path else v_m.storage_path end,
    'mime', coalesce(v_m.mime_detected, v_m.mime_declared), 'size', v_m.size_bytes, 'chunk', v_c.chunk_bytes);
end $$;

-- Informations pour la vérification après envoi (l'utilisateur est vérifié par la fonction serveur)
create or replace function public.media_finalize_info(p_media uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_m public.class_session_media; v_c public.class_media_settings := public.class_media_cfg();
begin
  select * into v_m from public.class_session_media where id = p_media;
  if v_m.id is null or v_m.uploaded_by is distinct from p_user or v_m.state <> 'uploading' then
    return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'bucket', 'class-media', 'path', v_m.storage_path, 'kind', v_m.kind,
    'mime', v_m.mime_declared, 'size', v_m.size_bytes, 'max_bytes', v_c.max_bytes);
end $$;

create or replace function public.media_mark_ready(p_media uuid, p_mime text, p_size bigint) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_m public.class_session_media; v_s public.class_sessions; v_minors boolean; v_c public.class_media_settings := public.class_media_cfg(); v_u uuid;
begin
  select * into v_m from public.class_session_media where id = p_media for update;
  if v_m.id is null or v_m.state <> 'uploading' then return jsonb_build_object('ok', false, 'code', 'state'); end if;
  if p_mime is distinct from v_m.mime_declared or p_size is null or p_size < 1 or p_size > v_c.max_bytes then
    return jsonb_build_object('ok', false, 'code', 'mismatch'); end if;
  select * into v_s from public.class_sessions where id = v_m.session_id;
  select coalesce(minors, false) into v_minors from public.academy_sections where id = v_s.section_id;
  update public.class_session_media set state = 'ready', location = 'main', mime_detected = p_mime, size_bytes = p_size, ready_at = now(),
         reserved_until = null,
         validation = case when coalesce(v_minors, false) then 'pending_validation' else 'approved' end,
         validation_note = case when coalesce(v_minors, false) then null else 'Validation automatique : groupe sans mineurs' end
   where id = v_m.id;
  insert into public.class_session_events (academy_id, session_id, actor_id, action, details)
  values (v_m.academy_id, v_m.session_id, null, 'media.ready', jsonb_build_object('media', v_m.id, 'mime', p_mime, 'size', p_size,
          'validation', case when coalesce(v_minors, false) then 'pending_validation' else 'approved' end));
  if coalesce(v_minors, false) then
    for v_u in select user_id from public.uzu_staff_with(v_s.academy_id, 'class_journal', array['approve']) loop
      perform public.uzu_notify(v_u, 'media_validation', 'Média à valider',
        'Un média du groupe « ' || v_s.group_name || ' » attend ta validation avant d''être visible.', '/', 'media-validate-' || v_m.id::text);
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'validation', case when coalesce(v_minors, false) then 'pending_validation' else 'approved' end);
end $$;

create or replace function public.media_mark_failed(p_media uuid, p_error text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_m public.class_session_media;
begin
  select * into v_m from public.class_session_media where id = p_media for update;
  if v_m.id is null or v_m.state <> 'uploading' then return false; end if;
  update public.class_session_media set state = 'deleted', deleted_at = now(), deleted_reason = 'verification_failed',
         verify_error = left(coalesce(p_error, 'refusé'), 200) where id = v_m.id;
  insert into public.class_session_events (academy_id, session_id, actor_id, action, details)
  values (v_m.academy_id, v_m.session_id, null, 'media.refused', jsonb_build_object('media', v_m.id, 'error', left(coalesce(p_error, ''), 200)));
  return true;
end $$;

-- Emplacement physique constaté par la fonction serveur après un déplacement ou un effacement
create or replace function public.media_set_location(p_media uuid, p_location text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_m public.class_session_media;
begin
  if p_location not in ('main','quarantine','none') then return false; end if;
  select * into v_m from public.class_session_media where id = p_media for update;
  if v_m.id is null then return false; end if;
  update public.class_session_media set location = p_location where id = v_m.id;
  insert into public.class_session_events (academy_id, session_id, actor_id, action, details)
  values (v_m.academy_id, v_m.session_id, null, case p_location when 'quarantine' then 'media.quarantined' when 'main' then 'media.returned' else 'media.file_deleted' end,
          jsonb_build_object('media', v_m.id));
  return true;
end $$;

-- Rapprochement : met à jour les états logiques (dépublication, republication, réservations expirées)
-- puis renvoie les opérations physiques à faire. p_session limite à une séance (après une dépublication).
create or replace function public.media_reconcile(p_session uuid, p_limit int) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  -- Dépublication : fichiers en quarantaine (D2). Les brouillons gardent leurs fichiers en place.
  update public.class_session_media m set state = 'quarantined', quarantine_reason = 'session_unpublished', quarantined_at = now()
    from public.class_sessions s
   where s.id = m.session_id and s.status = 'depublie' and m.state = 'ready' and (p_session is null or s.id = p_session);
  update public.class_media_tickets t set revoked_at = now()
    from public.class_session_media m join public.class_sessions s on s.id = m.session_id
   where t.media_id = m.id and t.revoked_at is null and s.status <> 'publie' and m.state = 'quarantined' and (p_session is null or s.id = p_session);
  -- Republication : seuls les fichiers mis en quarantaine pour cette raison reviennent
  update public.class_session_media m set state = 'ready', quarantine_reason = null, quarantined_at = null
    from public.class_sessions s
   where s.id = m.session_id and s.status = 'publie' and m.state = 'quarantined' and m.quarantine_reason = 'session_unpublished'
     and (p_session is null or s.id = p_session);
  -- Réservations expirées
  update public.class_session_media set state = 'deleted', deleted_at = now(), deleted_reason = 'reservation_expired'
   where state = 'uploading' and reserved_until <= now() and (p_session is null or session_id = p_session);
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('media', m.id,
      'op', case when m.state = 'deleted' then 'delete' else 'move' end,
      'from_bucket', case when m.location = 'quarantine' then 'class-media-quarantine' else 'class-media' end,
      'from_path', case when m.location = 'quarantine' then m.quarantine_path else m.storage_path end,
      'to_bucket', case when m.state = 'quarantined' then 'class-media-quarantine' else 'class-media' end,
      'to_path', case when m.state = 'quarantined' then m.quarantine_path else m.storage_path end,
      'to_location', case when m.state = 'deleted' then 'none' when m.state = 'quarantined' then 'quarantine' else 'main' end) x
      from public.class_session_media m
     where (p_session is null or m.session_id = p_session)
       and ((m.state = 'quarantined' and m.location = 'main')
         or (m.state = 'ready' and m.location = 'quarantine')
         or (m.state = 'deleted' and m.location <> 'none'))
     order by m.created_at limit greatest(1, least(coalesce(p_limit, 100), 500))) q), '[]'::jsonb);
end $$;

-- Purge (D5) : médias de plus de N mois, quarantaines de retrait de plus de N jours, jetons périmés,
-- registre de plus de N mois. Chaque suppression de média est tracée ; aucune copie n'est gardée.
create or replace function public.media_purge() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_c public.class_media_settings := public.class_media_cfg(); v_exp int; v_q int; v_t int; v_e int; v_r int; v_d int;
begin
  with u as (update public.class_session_media m set state = 'deleted', deleted_at = now(), deleted_reason = 'expired'
               from public.class_sessions s
              where s.id = m.session_id and m.state in ('ready','quarantined')
                and s.session_date < (current_date - make_interval(months => v_c.media_retention_months))
             returning m.id, m.academy_id, m.session_id),
       i as (insert into public.class_session_events (academy_id, session_id, actor_id, action, details)
             select academy_id, session_id, null, 'media.purged', jsonb_build_object('media', id, 'reason', 'expired') from u returning 1)
  select count(*) into v_exp from i;
  with u as (update public.class_session_media set state = 'deleted', deleted_at = now(), deleted_reason = 'removed_by_team'
              where state = 'quarantined' and quarantine_reason = 'removed_by_team'
                and quarantined_at < now() - make_interval(days => v_c.quarantine_days)
             returning id, academy_id, session_id),
       i as (insert into public.class_session_events (academy_id, session_id, actor_id, action, details)
             select academy_id, session_id, null, 'media.purged', jsonb_build_object('media', id, 'reason', 'quarantine_elapsed') from u returning 1)
  select count(*) into v_q from i;
  delete from public.class_media_tickets where expires_at < now() - interval '1 day';
  get diagnostics v_t = row_count;
  delete from public.class_media_removal_requests where status in ('completed','rejected')
     and coalesce(handled_at, created_at) < now() - make_interval(months => v_c.log_retention_months);
  get diagnostics v_r = row_count;
  delete from public.class_session_events where action like 'media.%' and created_at < now() - make_interval(months => v_c.log_retention_months);
  get diagnostics v_e = row_count;
  -- Lignes de médias effacés, sans contenu, au-delà de la durée du registre
  delete from public.class_session_media where state = 'deleted' and location = 'none'
     and deleted_at < now() - make_interval(months => v_c.log_retention_months)
     and not exists (select 1 from public.class_media_removal_requests r where r.media_id = class_session_media.id);
  get diagnostics v_d = row_count;
  return jsonb_build_object('expired', v_exp, 'quarantine_elapsed', v_q, 'tickets', v_t, 'requests', v_r, 'events', v_e, 'rows', v_d);
end $$;

-- -----------------------------------------------------------------------------------------
-- 8. Droits d'exécution
-- -----------------------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'class_media_cfg()', 'uzu_media_staff_view(public.class_sessions)', 'uzu_media_can_edit(public.class_sessions)',
    'uzu_media_can_approve(public.class_sessions)', 'uzu_media_visible(public.class_session_media)',
    'uzu_media_row_readable(public.class_session_media)', 'uzu_media_upload_ok(text)', 'uzu_media_revoke(uuid)',
    'session_media(uuid)', 'media_ticket(uuid, integer)', 'media_reserve(uuid, text, text, bigint, boolean, boolean)',
    'media_validate(uuid, text, text)', 'media_remove(uuid, text)', 'media_request_removal(uuid, text)',
    'media_handle_request(uuid, text, text)', 'media_restore(uuid, boolean, boolean, text)', 'set_section_minors(uuid, boolean)',
    'section_minors_list()', 'media_queue()', 'class_media_settings_get()', 'class_media_settings_set(jsonb)',
    'media_stream_check(text)', 'media_finalize_info(uuid, uuid)', 'media_mark_ready(uuid, text, bigint)',
    'media_mark_failed(uuid, text)', 'media_set_location(uuid, text)', 'media_reconcile(uuid, integer)', 'media_purge()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  -- Fonctions de l'application
  foreach f in array array[
    'session_media(uuid)', 'media_ticket(uuid, integer)', 'media_reserve(uuid, text, text, bigint, boolean, boolean)',
    'media_validate(uuid, text, text)', 'media_remove(uuid, text)', 'media_request_removal(uuid, text)',
    'media_handle_request(uuid, text, text)', 'media_restore(uuid, boolean, boolean, text)', 'set_section_minors(uuid, boolean)',
    'section_minors_list()', 'media_queue()', 'class_media_settings_get()', 'class_media_settings_set(jsonb)',
    -- appelées par les règles d'accès (table et stockage), évaluées avec le compte de l'utilisateur
    'uzu_media_row_readable(public.class_session_media)', 'uzu_media_upload_ok(text)'] loop
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- Fonctions du rôle serveur seul (le rôle service_role n'existe que sur Supabase)
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['media_stream_check(text)', 'media_finalize_info(uuid, uuid)', 'media_mark_ready(uuid, text, bigint)',
      'media_mark_failed(uuid, text)', 'media_set_location(uuid, text)', 'media_reconcile(uuid, integer)', 'media_purge()'] loop
      execute format('grant execute on function public.%s to service_role', f);
    end loop;
  end if;
end $$;

-- -----------------------------------------------------------------------------------------
-- 9. Stockage : deux espaces privés, une seule règle (envoi à l'emplacement réservé)
--    Aucune règle de lecture, de remplacement ni d'effacement pour les comptes connectés.
-- -----------------------------------------------------------------------------------------
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
      ('class-media', 'class-media', false, 52428800,
       array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']),
      ('class-media-quarantine', 'class-media-quarantine', false, 52428800, null)
    on conflict (id) do update set public = false;
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists uzu_class_media_insert on storage.objects';
    execute 'create policy uzu_class_media_insert on storage.objects for insert to authenticated '
         || 'with check (bucket_id = ''class-media'' and public.uzu_media_upload_ok(name))';
  end if;
end $$;

commit;

-- -----------------------------------------------------------------------------------------
-- Contrôle : 9 valeurs attendues = true, true, true, true, true, true, false, false, true
-- -----------------------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns where table_name = 'class_session_media' and column_name = 'state') as colonnes_media,
  exists (select 1 from information_schema.columns where table_name = 'academy_sections' and column_name = 'minors') as groupe_mineurs,
  (select count(*) = 3 from information_schema.tables where table_schema = 'public'
     and table_name in ('class_media_settings','class_media_tickets','class_media_removal_requests')) as tables_ajoutees,
  public.uzu_perm_catalog() ? 'minor_groups' and public.uzu_perm_catalog() ? 'class_journal' as droits,
  (select count(*) = 2 from storage.buckets where id in ('class-media','class-media-quarantine') and not public) as stockages_prives,
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'uzu_class_media_insert') as regle_envoi,
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'uzu_class_media%' and cmd in ('SELECT','UPDATE','DELETE')) as lecture_stockage_ouverte,
  has_function_privilege('authenticated', 'public.media_stream_check(text)', 'execute') as controle_ouvert_aux_comptes,
  (select public from storage.buckets where id = 'videos') is not true as videos_pedagogiques_inchangees;

-- =====================================================================================
-- RETOUR ARRIÈRE (base de test) — NE PAS EXÉCUTER sauf décision. À lancer après avoir retiré la
-- fonction serveur et les tâches planifiées. Retire uniquement ce que ce script a ajouté et remet
-- les trois éléments modifiés dans leur version de uzu-10.
-- Les fichiers des espaces class-media* doivent être vidés depuis le tableau de bord avant le delete.
-- =====================================================================================
-- begin;
-- drop policy if exists uzu_class_media_insert on storage.objects;
-- delete from storage.buckets where id in ('class-media','class-media-quarantine');   -- refusé si non vides
-- drop policy if exists uzu_class_session_media_select on public.class_session_media;
-- create policy uzu_class_session_media_select on public.class_session_media for select to authenticated
--   using (exists (select 1 from public.class_sessions s where s.id = session_id and public.uzu_journal_readable(s)));
-- -- journal_feed et uzu_perm_catalog : relancer leurs définitions de db/uzu-10-journal.sql (sections 2 et 5)
-- drop function if exists public.media_purge(), public.media_reconcile(uuid, integer), public.media_set_location(uuid, text),
--   public.media_mark_failed(uuid, text), public.media_mark_ready(uuid, text, bigint), public.media_finalize_info(uuid, uuid),
--   public.media_stream_check(text), public.class_media_settings_set(jsonb), public.class_media_settings_get(),
--   public.media_queue(), public.section_minors_list(), public.set_section_minors(uuid, boolean),
--   public.media_restore(uuid, boolean, boolean, text), public.media_handle_request(uuid, text, text),
--   public.media_request_removal(uuid, text), public.media_remove(uuid, text), public.media_validate(uuid, text, text),
--   public.media_reserve(uuid, text, text, bigint, boolean, boolean), public.media_ticket(uuid, integer), public.session_media(uuid),
--   public.uzu_media_revoke(uuid), public.uzu_media_upload_ok(text), public.uzu_media_row_readable(public.class_session_media),
--   public.uzu_media_visible(public.class_session_media), public.uzu_media_can_approve(public.class_sessions),
--   public.uzu_media_can_edit(public.class_sessions), public.uzu_media_staff_view(public.class_sessions), public.class_media_cfg();
-- drop table if exists public.class_media_removal_requests, public.class_media_tickets, public.class_media_settings;
-- delete from public.class_session_media;   -- uniquement les lignes créées par Class Media (table vide avant ce script)
-- alter table public.class_session_media drop constraint if exists class_session_media_cm_check;
-- -- Les colonnes ajoutées peuvent rester (vides) ; les retirer seulement sur décision explicite.
-- commit;
