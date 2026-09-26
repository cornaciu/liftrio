# Vercel + Supabase

The Vercel project uses this repository root, `npm run build`, and `frontend/dist`.
Supabase's Vercel integration supplies `POSTGRES_URL` to the server function.
Do not expose this URL or a Supabase secret in Vite's `VITE_` variables.

Run `supabase/opengym.sql` once in the database SQL editor. Set these Vercel
environment variables for Production (and Preview if using preview deployments):

- `RP_ID=open-gym-bay.vercel.app` (or the final custom hostname, without scheme)
- `ORIGIN=https://open-gym-bay.vercel.app` (or the matching full custom origin)
- `RP_NAME=openGym`
- `INVITE_ONLY=true` is optional; leave false for first registration.

Passkeys are tied to the hostname. Changing domains later means registering new
passkeys on the new hostname. The exercise media uses the pinned public exercise
dataset CDN rather than bundling ~140 MB into the Vercel deployment.

The Vercel version persists profiles, credentials, sessions, and workout state in
Postgres. Web push test and subscriptions work, but background rest-timer push,
scheduled daily reminders, and live admin presence need a durable worker and are
not available on serverless functions. Do not rely on those alerts until a worker
is added.
