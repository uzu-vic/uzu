#!/bin/bash
# Copie locale « état de la production » : base d'origine + lots 5 et 6 (jusqu'à uzu-8)
set -e
DB=${1:-prodlike}
su postgres -c "psql -q -c 'drop database if exists $DB' -c 'create database $DB'"
run(){ cp "$1" /tmp/a_run.sql; chmod 644 /tmp/a_run.sql; su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $DB -f /tmp/a_run.sql" > /tmp/a_out.txt 2>&1 || { echo "ÉCHEC: $1"; tail -5 /tmp/a_out.txt; exit 1; }; }
run /home/claude/cmsql/setup.sql
echo "alter table auth.users add column if not exists email_confirmed_at timestamptz default now(); create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); insert into storage.buckets values ('videos','videos',false,null,null) on conflict do nothing;" > /tmp/x.sql; run /tmp/x.sql
run /home/claude/lot5/uzu-retour-1-multiclub.sql; run /home/claude/lot5/uzu-retour-2-notifications.sql
run /home/claude/lot5/uzu-1-sauvegarde.sql; run /home/claude/lot5/uzu-2-equipe-permissions.sql
run /home/claude/deliver/uzu-club-profile.sql
for f in uzu-6-securite uzu-7-erreurs uzu-8-partenaires; do python3 -c "import re,sys;s=open('/home/claude/lot6/$f.sql').read();s=re.split(r'\n-- (6\. )?Contr[ôo]le',s)[0];open('/tmp/l6.sql','w').write(s)"; run /tmp/l6.sql; done
run /home/claude/audit/stubs.sql
echo "base « production » prête : $DB"
