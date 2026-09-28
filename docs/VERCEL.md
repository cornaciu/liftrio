# Vercel + Supabase

The Vercel project uses this repository root, `npm run build`, and `frontend/dist`.
Supabase's Vercel integration supplies `POSTGRES_URL` to the server function.
Do not expose this URL or a Supabase secret in Vite's `VITE_` variables.

Download the certificate from Supabase Dashboard → Database → Settings →
SSL configuration. Base64-encode the complete PEM file, then add it to Vercel
as `POSTGRES_CA_CERT_BASE64` for Production and Preview. This lets the server
verify the Supabase TLS certificate. For example, on macOS or Linux:

```sh
base64 < prod-ca-2021.crt | tr -d '\n'
```

Paste the output as the environment variable value, then redeploy. Keep TLS
verification enabled; the API returns 503 if this certificate is missing.

Run `supabase/opengym.sql` once in the database SQL editor. The existing `opengym_kv` table name is retained so deployed Liftrio data remains compatible. Set these Vercel
environment variables for Production (and Preview if using preview deployments):

- `ORIGIN=https://open-gym-bay.vercel.app` may stay in place for existing sessions and push settings; Liftrio accepts passkeys from both the legacy hostname and `https://liftrio.vercel.app`.
- `PASSKEY_ORIGINS` is optional; add comma-separated HTTPS origins here if you connect another hostname.
- `RP_NAME=Liftrio` (optional; if omitted, the API uses Liftrio automatically)
- `INVITE_ONLY=true` is optional; leave false for first registration.

Passkeys are tied to their hostname. Keep the legacy Liftrio hostname available for profiles whose passkeys were created there; those users can continue signing in through that address while new profiles use the Liftrio hostname. The exercise media uses the pinned public exercise
dataset CDN rather than bundling ~140 MB into the Vercel deployment.

The Vercel version persists profiles, credentials, sessions, and workout state in
Postgres. Web push subscriptions and test alerts are supported. Rest-timer alerts
are stored in Postgres and dispatched by a Supabase Cron job. Vercel Hobby Cron
cannot run frequently enough for this, so configure Supabase using
`supabase/rest_timer_cron.sql`:

1. Generate a secret with `openssl rand -hex 32`.
2. Add it in Vercel → Project Settings → Environment Variables as
   `REST_TIMER_CRON_SECRET` for Production, then redeploy.
3. Replace the secret placeholder in `supabase/rest_timer_cron.sql` with the same
   value, run the SQL once in Supabase SQL Editor, and confirm the URL matches the
   production domain.
4. On iPhone, install the site using Share → Add to Home Screen, open that home
   screen app, sign in, then enable Push notifications in Liftrio Settings. iOS
   web push requires a Home Screen web app and notification permission.

The Supabase job checks pending timers every 5 seconds. That limits the
scheduler's polling delay to about 5 seconds, but the browser push service may
still add delivery delay, especially on a locked iPhone. The timer recalculates
from its end timestamp when the app returns to the foreground. A live countdown displayed on the iPhone Lock Screen
requires an installed native iOS app with an ActivityKit Live Activity; a Vercel
website/PWA cannot publish that lock-screen interface. The Capacitor native build
can schedule a local rest alert with iOS when notification permission is granted.
