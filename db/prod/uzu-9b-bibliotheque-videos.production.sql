-- =========================================================================================
-- UZU — PRODUCTION : BIBLIOTHÈQUE, VIDÉOS PÉDAGOGIQUES (uzu-9b) — PRÉPARÉ, NE PAS EXÉCUTER SANS AUTORISATION
-- Corps identique à db/uzu-9b-bibliotheque-videos.sql (validé sur la base de test).
-- Garde-fou : refuse de s'exécuter sans l'instantané uzu-p1 (retour arrière sans perte).
-- Ordre : après uzu-9 (Bibliothèque), avant uzu-p9 (contrôle après déploiement).
-- =========================================================================================
begin;

do $$ declare n int := 0; begin
  if to_regclass('uzu_deploy.snapshot') is not null then execute 'select count(*) from uzu_deploy.snapshot where kind = ''function''' into n; end if;
  if n = 0 then raise exception 'Arrêt : instantané uzu-p1 introuvable. Le prendre AVANT tout déploiement (retour arrière sans perte).'; end if;
end $$;

do $$ begin
  if to_regclass('public.lib_techniques') is null or to_regprocedure('public.uzu_lib_member(uuid)') is null then
    raise exception 'Bibliothèque (uzu-9-bibliotheque.sql) absente : applique-la d''abord';
  end if;
  if not exists (select 1 from storage.buckets where id = 'videos') then
    raise exception 'Stockage pédagogique « videos » absent : rien n''a été fait';
  end if;
end $$;

-- -----------------------------------------------------------------------------------------
-- 1. Table des vidéos de la Bibliothèque (par club)
-- -----------------------------------------------------------------------------------------
create table if not exists public.club_lib_videos (
  id                  uuid primary key default gen_random_uuid(),
  academy_id          uuid not null references public.clubs (id) on delete cascade,
  target_kind         text not null check (target_kind in ('technique','flow')),
  -- « restrict » : le catalogue ne peut pas perdre une fiche qui porte des vidéos sans décision
  technique_id        text references public.lib_techniques (id) on delete restrict,
  flow_id             text references public.lib_flows (id) on delete restrict,
  title               text not null default '' check (length(title) <= 120),
  path                text not null unique,
  poster_path         text unique,
  mime                text not null check (mime in ('video/mp4','video/webm')),
  size_bytes          bigint not null check (size_bytes between 1 and 52428800),
  duration_s          numeric(7,1) check (duration_s is null or duration_s between 0 and 36000),
  width               int check (width is null or width between 1 and 10000),
  height              int check (height is null or height between 1 and 10000),
  position            int not null default 0,
  status              text not null default 'pending' check (status in ('pending','ready','removed')),
  replaces            uuid references public.club_lib_videos (id) on delete set null,
  rights_declared_at  timestamptz not null,
  rights_declared_by  uuid references auth.users (id) on delete set null,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  ready_at            timestamptz,
  removed_at          timestamptz,
  removed_by          uuid references auth.users (id) on delete set null,
  check ((target_kind = 'technique') = (technique_id is not null)),
  check ((target_kind = 'flow') = (flow_id is not null)),
  -- toujours dans le sous-dossier Bibliothèque du club : jamais un fichier existant
  check (path like academy_id::text || '/lib/%'),
  check (poster_path is null or poster_path like academy_id::text || '/lib/%')
);
create index if not exists club_lib_videos_target_idx on public.club_lib_videos (academy_id, target_kind, technique_id, flow_id, status, position);

alter table public.club_lib_videos enable row level security;
revoke all on public.club_lib_videos from anon, authenticated;
grant select on public.club_lib_videos to authenticated;
-- Lecture : membres actifs du club, vidéos en ligne seulement. Aucune écriture directe.
drop policy if exists uzu_lib_videos_select on public.club_lib_videos;
create policy uzu_lib_videos_select on public.club_lib_videos for select to authenticated
  using (status = 'ready' and academy_id = public.uzu_active_academy() and public.uzu_lib_member(academy_id));

-- -----------------------------------------------------------------------------------------
-- 2. Fonctions serveur
-- -----------------------------------------------------------------------------------------
-- Personne autorisée à gérer les vidéos de la Bibliothèque dans ce club
create or replace function public.uzu_lib_video_staff(p_academy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_academy is not null and public.uzu_lib_member(p_academy)
     and (public.uzu_can(p_academy, 'library', 'approve') or public.uzu_can(p_academy, 'library', 'manage'))
$$;

-- Réserver l'envoi d'une vidéo (et de sa miniature) pour une fiche ou un enchaînement.
-- p_replaces : vidéo en ligne à remplacer (même cible) ; elle reste en ligne jusqu'à la confirmation.
create or replace function public.library_video_reserve(p_target_kind text, p_target text, p_mime text, p_size bigint,
  p_title text, p_rights boolean, p_replaces uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy();
  v_disc text; v_id uuid := gen_random_uuid(); v_path text; v_poster text; v_old public.club_lib_videos; v_n int;
begin
  if not public.uzu_lib_video_staff(v_a) then raise exception 'Action non autorisée : droit « valider » ou « gérer » la Bibliothèque requis'; end if;
  if p_target_kind = 'technique' then
    select discipline_id into v_disc from public.lib_techniques where id = p_target and not archived;
  elsif p_target_kind = 'flow' then
    select discipline_id into v_disc from public.lib_flows where id = p_target;
  else raise exception 'Cible inconnue'; end if;
  if v_disc is null then raise exception 'Fiche ou enchaînement introuvable'; end if;
  if not (v_disc = any (public.uzu_lib_disciplines(v_a))) then raise exception 'Discipline non activée dans ce club'; end if;
  if p_mime not in ('video/mp4','video/webm') then raise exception 'Format non accepté : vidéo MP4, MOV ou WebM'; end if;
  if p_size is null or p_size < 1 or p_size > 52428800 then raise exception 'Vidéo trop lourde : 50 Mo au plus'; end if;
  if length(btrim(coalesce(p_title, ''))) > 120 then raise exception 'Titre trop long (120 caractères au plus)'; end if;
  if not coalesce(p_rights, false) then
    raise exception 'Confirme que les personnes filmées (et les représentants légaux des mineurs) ont donné leur accord';
  end if;
  if p_replaces is not null then
    select * into v_old from public.club_lib_videos where id = p_replaces and academy_id = v_a and status = 'ready' for update;
    if v_old.id is null or v_old.target_kind <> p_target_kind or coalesce(v_old.technique_id, v_old.flow_id) <> p_target then
      raise exception 'Vidéo à remplacer introuvable';
    end if;
  else
    select count(*) into v_n from public.club_lib_videos
     where academy_id = v_a and target_kind = p_target_kind and coalesce(technique_id, flow_id) = p_target
       and (status = 'ready' or (status = 'pending' and created_at > now() - interval '2 hours'));
    if v_n >= 10 then raise exception 'Limite atteinte : 10 vidéos au plus par fiche ou enchaînement'; end if;
  end if;
  if (select count(*) from public.club_lib_videos where created_by = v_uid and created_at > now() - interval '1 day') >= 40 then
    raise exception 'Trop d''envois aujourd''hui : réessaie demain';
  end if;
  v_path   := v_a::text || '/lib/' || v_id::text || case when p_mime = 'video/webm' then '.webm' else '.mp4' end;
  v_poster := v_a::text || '/lib/' || v_id::text || '.jpg';
  insert into public.club_lib_videos (id, academy_id, target_kind, technique_id, flow_id, title, path, poster_path, mime, size_bytes,
                                      status, replaces, rights_declared_at, rights_declared_by, created_by)
  values (v_id, v_a, p_target_kind, case when p_target_kind = 'technique' then p_target end, case when p_target_kind = 'flow' then p_target end,
          btrim(coalesce(p_title, '')), v_path, v_poster, p_mime, p_size, 'pending', p_replaces, now(), v_uid, v_uid);
  return jsonb_build_object('id', v_id, 'bucket', 'videos', 'path', v_path, 'poster_path', v_poster);
end $$;

-- Règle d'envoi du stockage : uniquement un emplacement réservé par soi-même il y a moins de 2 h,
-- pas encore utilisé, dans le sous-dossier Bibliothèque de son club.
create or replace function public.uzu_lib_video_upload_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and p_name like '%/lib/%' and exists (
    select 1 from public.club_lib_videos v
     where (v.path = p_name or v.poster_path = p_name) and v.status = 'pending'
       and v.created_by = auth.uid() and v.created_at > now() - interval '2 hours'
       and v.academy_id = public.uzu_my_club() and public.uzu_lib_video_staff(v.academy_id))
$$;

-- Règle de suppression du stockage : uniquement les fichiers Bibliothèque d'une vidéo retirée
-- (ou d'un envoi inachevé par soi-même), par une personne autorisée du club.
create or replace function public.uzu_lib_video_delete_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and p_name like '%/lib/%' and exists (
    select 1 from public.club_lib_videos v
     where (v.path = p_name or v.poster_path = p_name)
       and (v.status = 'removed' or (v.status = 'pending' and v.created_by = auth.uid()))
       and v.academy_id = public.uzu_my_club() and public.uzu_lib_video_staff(v.academy_id))
$$;

-- Confirmer après l'envoi : le serveur vérifie le fichier réellement déposé (taille, type).
-- En cas de remplacement, l'ancienne vidéo est retirée et la nouvelle prend sa place.
-- Renvoie les fichiers à effacer (ancienne vidéo, envoi refusé).
create or replace function public.library_video_confirm(p_id uuid, p_duration numeric, p_width int, p_height int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy();
  v public.club_lib_videos; o record; po record; v_old public.club_lib_videos; v_pos int; v_clean text[] := '{}';
begin
  select * into v from public.club_lib_videos where id = p_id and academy_id = v_a for update;
  if v.id is null or v.created_by is distinct from v_uid or v.status <> 'pending' then raise exception 'Envoi introuvable'; end if;
  if not public.uzu_lib_video_staff(v_a) then raise exception 'Action non autorisée'; end if;
  select (metadata->>'size')::bigint as size, metadata->>'mimetype' as mime into o
    from storage.objects where bucket_id = 'videos' and name = v.path;
  if o.size is null or o.size <> v.size_bytes or o.size > 52428800 or coalesce(o.mime, '') <> v.mime then
    update public.club_lib_videos set status = 'removed', removed_at = now(), removed_by = v_uid, updated_at = now() where id = v.id;
    return jsonb_build_object('ok', false, 'msg', case when o.size is null then 'Fichier non reçu : relance l''envoi' else 'Fichier refusé : taille ou format différent de l''annonce' end,
                              'cleanup', to_jsonb(array_remove(array[case when o.size is not null then v.path end, v.poster_path], null)));
  end if;
  select (metadata->>'size')::bigint as size, metadata->>'mimetype' as mime into po
    from storage.objects where bucket_id = 'videos' and name = v.poster_path;
  if po.size is null or po.size > 1048576 or po.mime <> 'image/jpeg' then
    if po.size is not null then v_clean := v_clean || v.poster_path; end if;
    v.poster_path := null;
  end if;
  if v.replaces is not null then
    select * into v_old from public.club_lib_videos where id = v.replaces and academy_id = v_a for update;
  end if;
  if v_old.id is not null and v_old.status = 'ready' then
    v_pos := v_old.position;
    update public.club_lib_videos set status = 'removed', removed_at = now(), removed_by = v_uid, updated_at = now() where id = v_old.id;
    v_clean := v_clean || v_old.path || coalesce(v_old.poster_path, v_old.path);
  else
    select coalesce(max(position), 0) + 1 into v_pos from public.club_lib_videos
     where academy_id = v_a and target_kind = v.target_kind and coalesce(technique_id, flow_id) = coalesce(v.technique_id, v.flow_id) and status = 'ready';
  end if;
  update public.club_lib_videos
     set status = 'ready', ready_at = now(), updated_at = now(), position = v_pos, poster_path = v.poster_path,
         title = case when title = '' and v_old.id is not null then v_old.title else title end,
         duration_s = case when p_duration between 0 and 36000 then round(p_duration, 1) end,
         width = case when p_width between 1 and 10000 then p_width end, height = case when p_height between 1 and 10000 then p_height end
   where id = v.id;
  perform public.uzu_audit(v_a, case when v_old.id is not null then 'library.video_replace' else 'library.video_add' end, 'library_video', v.id::text,
    jsonb_build_object('target', coalesce(v.technique_id, v.flow_id), 'kind', v.target_kind, 'replaces', v_old.id, 'size', v.size_bytes));
  return jsonb_build_object('ok', true, 'id', v.id, 'cleanup', to_jsonb(array(select distinct x from unnest(v_clean) x)));
end $$;

-- Retirer une vidéo : elle disparaît aussitôt ; renvoie ses fichiers à effacer.
create or replace function public.library_video_remove(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v public.club_lib_videos;
begin
  if not public.uzu_lib_video_staff(v_a) then raise exception 'Action non autorisée : droit « valider » ou « gérer » la Bibliothèque requis'; end if;
  select * into v from public.club_lib_videos where id = p_id and academy_id = v_a and status in ('ready','pending') for update;
  if v.id is null then raise exception 'Vidéo introuvable'; end if;
  if v.status = 'pending' and v.created_by is distinct from v_uid then raise exception 'Vidéo introuvable'; end if;
  update public.club_lib_videos set status = 'removed', removed_at = now(), removed_by = v_uid, updated_at = now() where id = v.id;
  perform public.uzu_audit(v_a, 'library.video_remove', 'library_video', v.id::text,
    jsonb_build_object('target', coalesce(v.technique_id, v.flow_id), 'kind', v.target_kind, 'title', v.title));
  return jsonb_build_object('ok', true, 'cleanup', to_jsonb(array_remove(array[v.path, v.poster_path], null)));
end $$;

-- Changer le titre et/ou déplacer la vidéo d'un cran (p_move : -1 vers le haut, 1 vers le bas, 0 rien)
create or replace function public.library_video_update(p_id uuid, p_title text, p_move int default 0) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public.uzu_require_auth(); v_a uuid := public.uzu_active_academy(); v public.club_lib_videos; n public.club_lib_videos;
begin
  if not public.uzu_lib_video_staff(v_a) then raise exception 'Action non autorisée : droit « valider » ou « gérer » la Bibliothèque requis'; end if;
  select * into v from public.club_lib_videos where id = p_id and academy_id = v_a and status = 'ready' for update;
  if v.id is null then raise exception 'Vidéo introuvable'; end if;
  if p_title is not null then
    if length(btrim(p_title)) > 120 then raise exception 'Titre trop long (120 caractères au plus)'; end if;
    update public.club_lib_videos set title = btrim(p_title), updated_at = now() where id = v.id;
  end if;
  if coalesce(p_move, 0) <> 0 then
    select * into n from public.club_lib_videos
     where academy_id = v_a and target_kind = v.target_kind and coalesce(technique_id, flow_id) = coalesce(v.technique_id, v.flow_id)
       and status = 'ready' and id <> v.id
       and case when p_move < 0 then position < v.position or (position = v.position and id < v.id)
                else position > v.position or (position = v.position and id > v.id) end
     order by case when p_move < 0 then -position else position end, id limit 1 for update;
    if n.id is not null then
      update public.club_lib_videos set position = n.position, updated_at = now() where id = v.id;
      update public.club_lib_videos set position = v.position + case when n.position = v.position then (case when p_move < 0 then 1 else -1 end) else 0 end, updated_at = now() where id = n.id;
    end if;
  end if;
  return true;
end $$;

-- -----------------------------------------------------------------------------------------
-- 3. Règles du stockage pédagogique : AJOUT de deux règles limitées à <club>/lib/…
--    (les règles existantes uzu_videos_select / _insert / _delete ne sont pas modifiées)
-- -----------------------------------------------------------------------------------------
drop policy if exists uzu_lib_video_insert on storage.objects;
create policy uzu_lib_video_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and public.uzu_lib_video_upload_ok(name));
drop policy if exists uzu_lib_video_delete on storage.objects;
create policy uzu_lib_video_delete on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and public.uzu_lib_video_delete_ok(name));

-- -----------------------------------------------------------------------------------------
-- 4. Droits d'exécution : rien pour les visiteurs non connectés
-- -----------------------------------------------------------------------------------------
revoke all on function public.uzu_lib_video_staff(uuid) from public, anon;
revoke all on function public.library_video_reserve(text, text, text, bigint, text, boolean, uuid) from public, anon;
revoke all on function public.uzu_lib_video_upload_ok(text) from public, anon;
revoke all on function public.uzu_lib_video_delete_ok(text) from public, anon;
revoke all on function public.library_video_confirm(uuid, numeric, int, int) from public, anon;
revoke all on function public.library_video_remove(uuid) from public, anon;
revoke all on function public.library_video_update(uuid, text, int) from public, anon;
grant execute on function public.uzu_lib_video_staff(uuid) to authenticated;
grant execute on function public.library_video_reserve(text, text, text, bigint, text, boolean, uuid) to authenticated;
grant execute on function public.uzu_lib_video_upload_ok(text) to authenticated;
grant execute on function public.uzu_lib_video_delete_ok(text) to authenticated;
grant execute on function public.library_video_confirm(uuid, numeric, int, int) to authenticated;
grant execute on function public.library_video_remove(uuid) to authenticated;
grant execute on function public.library_video_update(uuid, text, int) to authenticated;

commit;

-- Contrôle : 1 table, 2 règles ajoutées au stockage pédagogique, règles existantes conservées,
-- stockage pédagogique toujours privé, aucune vidéo existante touchée, rien dans Class Media
select (select count(*) from pg_tables where schemaname = 'public' and tablename = 'club_lib_videos') as table_ajoutee,
       (select count(*) from pg_policies where schemaname = 'storage' and policyname in ('uzu_lib_video_insert','uzu_lib_video_delete')) as regles_ajoutees,
       (select count(*) from pg_policies where schemaname = 'storage' and policyname in ('uzu_videos_select','uzu_videos_insert','uzu_videos_delete')) as regles_existantes,
       (select public from storage.buckets where id = 'videos') is not true as stockage_prive,
       (select count(*) from public.club_lib_videos) as videos_bibliotheque,
       not exists (select 1 from pg_policies where schemaname = 'storage' and policyname like 'uzu_lib_video%'
                   and coalesce(qual, '') || coalesce(with_check, '') like '%class-media%') as rien_dans_class_media;
