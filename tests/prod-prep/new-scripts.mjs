// Applique les sept scripts de la branche (ordre du plan de production) sur une base pglite « production »
import fs from "fs";
const R = "/home/claude/uzu-repo/db/";
const rd = f => fs.readFileSync(R + f, "utf8");
const stubs = `
create schema if not exists extensions;
create or replace function extensions.digest(t text, a text) returns bytea language sql immutable as $$ select sha256(convert_to(t, 'UTF8')) $$;
create schema if not exists vault;
create table if not exists vault.secrets_t(name text primary key, decrypted_secret text);
create or replace view vault.decrypted_secrets as select name, decrypted_secret from vault.secrets_t;
insert into vault.secrets_t values ('class_media_cron_secret', repeat('ab',32)), ('class_media_function_url','https://ntypsrdwxrkanahhuixx.supabase.co/functions/v1/class-media') on conflict do nothing;
create schema if not exists cron; create table if not exists cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create table if not exists cron.job_run_details(jobid bigint, status text, return_message text, start_time timestamptz);
create or replace function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname, schedule, command) values (n, s, c) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create or replace function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n returning true $$;
create schema if not exists net;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
do $$ begin create role service_role nologin bypassrls; exception when others then null; end $$;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
insert into storage.buckets(id, name, public) values ('videos','videos',false) on conflict do nothing;
`;
export const ORDER = ["uzu-9-bibliotheque.sql", "uzu-10-journal.sql", "uzu-11-journal-vue.sql", "uzu-12-focus-groupes.sql", "uzu-13-class-media.sql", "uzu-13c-class-media-secret.sql", "uzu-13b-class-media-taches.sql"];
export async function applyNew(db, log = () => {}) {
  await db.exec(stubs);
  for (const f of ORDER) { await db.exec(rd(f)); log("appliqué : " + f) }
}
