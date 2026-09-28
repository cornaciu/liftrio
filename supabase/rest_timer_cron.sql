-- Run once in Supabase SQL Editor after replacing the two values below.
-- Create a random secret with: openssl rand -hex 32
-- Add that exact value to Vercel as REST_TIMER_CRON_SECRET (Production), then redeploy.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Replace both placeholders. Keep the secret private; this SQL is not part of the app bundle.
select vault.create_secret('REPLACE_WITH_REST_TIMER_CRON_SECRET', 'opengym_rest_timer_secret');
select vault.create_secret('https://open-gym-bay.vercel.app/api/push/rest-timer/dispatch', 'opengym_rest_timer_url');

-- Remove a prior job when re-running this script.
select cron.unschedule(jobid)
from cron.job
where jobname = 'opengym-rest-timer-dispatch';

-- Supabase Cron checks pending timers every 5 seconds for low-latency push delivery.
-- Requires a Supabase Postgres version that supports sub-minute pg_cron intervals.
select cron.schedule(
  'opengym-rest-timer-dispatch',
  '5 seconds',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'opengym_rest_timer_url'),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'opengym_rest_timer_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
