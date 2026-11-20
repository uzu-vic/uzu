create schema if not exists cron; create table if not exists cron.job(jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create table if not exists cron.job_run_details(jobid bigint, status text, return_message text, start_time timestamptz);
create or replace function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job(jobname, schedule, command) values (n, s, c) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create or replace function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname = n returning true $$;
create schema if not exists net;
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000) returns bigint language sql as $$ select 1::bigint $$;
