#!/bin/bash
# Répétition locale de la séquence de production AVEC les vidéos de la Bibliothèque (uzu-9b).
# Copie « état de la production » → p0 → p1 → 9 → 9b → 10 → 11 → 12 → 13 → 13c → 13b → p9 → données → pR2 → contrôles.
# Aucune connexion à la production : PostgreSQL 16 local uniquement.
set -e
DB=prod9b; R=/home/claude/uzu-repo; P=$R/db/prod; OUT=/tmp/seq9b; mkdir -p $OUT
bash $R/tests/prod-prep/build-prod.sh $DB > /dev/null
q(){ cp "$1" /tmp/s9b.sql; chmod 644 /tmp/s9b.sql; su postgres -c "psql -v ON_ERROR_STOP=1 -d $DB -f /tmp/s9b.sql" > "$OUT/$2.txt" 2>&1 || { echo "ÉCHEC: $2"; tail -6 "$OUT/$2.txt"; exit 1; }; }
c(){ su postgres -c "psql -d $DB -Atc \"$1\""; }
# Stockage local : colonnes de Supabase, deux vidéos pédagogiques existantes et leurs références
c "alter table storage.objects add column if not exists metadata jsonb, add column if not exists created_at timestamptz default now(), add column if not exists updated_at timestamptz default now();
   create schema if not exists vault; do \\\$\\\$ begin if to_regclass('vault.secrets') is null and to_regclass('vault.secrets_t') is not null then create view vault.secrets as select name from vault.secrets_t; end if; end \\\$\\\$;
   insert into storage.objects (bucket_id, name, metadata, updated_at) select 'videos', id::text || '/lx2k-focus.mp4', '{\\\"size\\\": 4000000, \\\"mimetype\\\": \\\"video/mp4\\\"}', '2026-10-01' from public.clubs limit 1;
   insert into storage.objects (bucket_id, name, metadata, updated_at) values ('videos', 'ancienne-racine.mp4', '{\\\"size\\\": 900, \\\"mimetype\\\": \\\"video/mp4\\\"}', '2026-01-01');" > /dev/null
q $P/uzu-p0-controle-prealable-production.sql p0
q $P/uzu-p1-instantane-avant-deploiement.sql p1
q $R/db/uzu-9-bibliotheque.sql s9
q $P/uzu-9b-bibliotheque-videos.production.sql s9b
q $R/db/uzu-10-journal.sql s10
q $R/db/uzu-11-journal-vue.sql s11
q $R/db/uzu-12-focus-groupes.sql s12
q $P/uzu-13-class-media.production.sql s13
c "update vault.secrets_t set decrypted_secret = 'https://ixkewdxtuhxfiodwhhzr.supabase.co/functions/v1/class-media' where name = 'class_media_function_url'" > /dev/null
q $P/uzu-13c-class-media-secret.production.sql s13c
q $P/uzu-13b-class-media-taches.production.sql s13b
q $P/uzu-p9-controle-apres-deploiement.sql p9
# Données créées après le déploiement : une vidéo Bibliothèque en ligne (réservée, déposée, confirmée)
CA=$(c "select academy_id from public.academy_members where role='owner' limit 1")
OW=$(c "select user_id from public.academy_members where role='owner' limit 1")
c "set role authenticated; select set_config('request.jwt.claims', json_build_object('sub','$OW','role','authenticated')::text, false);
   select set_config('request.jwt.claim.sub', '$OW', false);
   create temp table r as select public.library_video_reserve('technique','G17','video/mp4',2000000,'Démonstration',true,null) j;
   insert into storage.objects (bucket_id, name, metadata) select 'videos', j->>'path', '{\\\"size\\\": 2000000, \\\"mimetype\\\": \\\"video/mp4\\\"}' from r;
   select public.library_video_confirm((select (j->>'id')::uuid from r), 10, 1280, 720)->>'ok';" > $OUT/donnees.txt 2>&1
q $P/uzu-pR2-desactivation-sans-perte.sql pR2
echo "--- p0 (D1/D2 ✖ normaux en local : pg_cron/pg_net simulés)"; grep -E "^ (A|B|C|D|E)[0-9]" $OUT/p0.txt | awk -F'|' '{print $1 $3}' | tr -s ' ' | tr '\n' ' '; echo
echo "--- p1"; grep -E "policy_def|videos_files" $OUT/p1.txt | tr -s ' '
echo "--- 9b production"; tail -4 $OUT/s9b.txt | head -2 | tr -s ' '
echo "--- p9"; grep -E "^ (S|X|I|Z)[0-9]" $OUT/p9.txt | awk -F'|' '{print $1 $3 $4}' | tr -s ' '
echo "--- vidéo Bibliothèque en ligne après déploiement : $(grep -c true $OUT/donnees.txt)"
echo "--- pR2"; grep -E "Règle de stockage retirée|donnees_conservees|fonctions_existantes|fonctions_ajoutees|regles_stockage" $OUT/pR2.txt | tr -s ' '
echo "--- après retour arrière"
c "select 'vidéos Bibliothèque conservées: ' || count(*) from public.club_lib_videos where status = 'ready'"
c "select 'règles stockage existantes intactes: ' || (count(*) = 3) from pg_policies where policyname in ('uzu_videos_select','uzu_videos_insert','uzu_videos_delete')"
c "select 'fichiers pédagogiques existants identiques: ' || ((select md5(coalesce(string_agg(id::text || name || coalesce(metadata::text, '') || coalesce(updated_at::text, ''), '|' order by name), '')) from storage.objects where bucket_id = 'videos' and name not like '%/lib/%') = (select definition from uzu_deploy.snapshot where kind = 'videos_files'))"
c "select 'archive créée: ' || count(*) from pg_namespace where nspname like 'uzu_archive_%'"
