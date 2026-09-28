-- Reconfigure the existing rest-timer dispatcher to check every 5 seconds.
-- Run this in Supabase SQL Editor after the initial REST_TIMER_CRON_SECRET setup.
-- This reuses the URL and secret already stored in Supabase Vault.

select cron.unschedule(jobid)
from cron.job
where jobname = 'opengym-rest-timer-dispatch';

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
      body := '{}'::jsonb,
      timeout_milliseconds := 5000
    );
  $$
);
