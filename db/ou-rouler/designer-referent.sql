-- =========================================================================================
-- UZU — « Où rouler ? » : DÉSIGNER (OU RETIRER) UN RÉFÉRENT UZU DE L'ANNUAIRE — BASE DE TEST
-- NE PAS EXÉCUTER sans l'accord écrit d'Ali, qui nomme le compte. Aucun compte n'est désigné à ce jour.
-- Cette version refuse de tourner hors de la base de test (ntypsrdwxrkanahhuixx). La version de
-- production sera préparée à part, avec le plan de production, et soumise à autorisation.
--
-- Ce que le rôle donne : l'espace « Référent UZU » de l'annuaire (fiches référencées, propositions,
-- masquage de modération, journal). Rien d'autre : pas d'accès aux clubs, élèves, séances, vidéos,
-- ni aux droits d'administrateur de la plateforme.
--
-- Mode d'emploi :
--   1. remplacer ADRESSE_A_DESIGNER par l'adresse du compte UZU (base de test) de la personne désignée ;
--   2. remplacer MOTIF par la référence de la décision (ex. « Accord d'Ali du 20/11/2026, essai base de test ») ;
--   3. exécuter dans l'éditeur SQL de la base de TEST ; la dernière requête affiche les référents actifs.
-- Pour retirer le rôle : bloc RETRAIT en bas (le journal de modération est conservé).
-- =========================================================================================
do $$
declare
  v_email text := 'ADRESSE_A_DESIGNER';
  v_note  text := 'MOTIF';
  v_url text; v_uid uuid;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
  if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' then
    raise exception 'Arrêt : cette base n''est pas reconnue comme la base de test. Rien n''a été fait.';
  end if;
  if v_email = 'ADRESSE_A_DESIGNER' or v_note = 'MOTIF' then
    raise exception 'Arrêt : renseigne l''adresse du compte désigné et le motif. Rien n''a été fait.';
  end if;
  if to_regclass('public.dir_moderators') is null then raise exception 'Arrêt : uzu-14a2 n''est pas installé.'; end if;
  select id into v_uid from auth.users where lower(email) = lower(btrim(v_email));
  if v_uid is null then raise exception 'Arrêt : aucun compte UZU avec cette adresse sur la base de test. Rien n''a été fait.'; end if;
  insert into public.dir_moderators (user_id, label, active, granted_note, revoked_at)
  values (v_uid, 'Référent UZU', true, left(v_note, 200), null)
  on conflict (user_id) do update set active = true, revoked_at = null, granted_at = now(), granted_note = excluded.granted_note;
  insert into public.dir_moderation_log (actor, action, target, details) values (null, 'moderator.granted', v_uid::text, jsonb_build_object('note', left(v_note, 200)));
end $$;

select m.label, coalesce(nullif(p.display_name, ''), 'compte ' || left(m.user_id::text, 8)) as personne, m.granted_at, m.granted_note
  from public.dir_moderators m left join public.profiles p on p.user_id = m.user_id
 where m.active and m.revoked_at is null;

-- ----------------------------------------------------------------------------------------- RETRAIT
-- do $$
-- declare v_email text := 'ADRESSE_A_RETIRER'; v_url text; v_uid uuid;
-- begin
--   select decrypted_secret into v_url from vault.decrypted_secrets where name = 'class_media_function_url';
--   if v_url is null or v_url not like '%ntypsrdwxrkanahhuixx%' then raise exception 'Arrêt : pas la base de test.'; end if;
--   select id into v_uid from auth.users where lower(email) = lower(btrim(v_email));
--   if v_uid is null then raise exception 'Arrêt : aucun compte avec cette adresse.'; end if;
--   update public.dir_moderators set active = false, revoked_at = now() where user_id = v_uid;
--   insert into public.dir_moderation_log (actor, action, target) values (null, 'moderator.revoked', v_uid::text);
-- end $$;
