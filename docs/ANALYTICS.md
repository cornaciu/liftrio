# Guest usage statistics (Vercel / Supabase)

The browser sends a random UUID and either `landing` or `guest` to
`POST /api/analytics/visit`. The server stores an HMAC of the UUID as
`analytics:visitor:<hash>` in the existing `public.opengym_kv` table.
No schema migration is needed. Analytics do not contain account IDs, names,
IP addresses, user agents, workout logs or nutrition entries.

`guestSessions` counts one guest entry per session. A session ends after
30 minutes without an observed visit. Visible unsigned-in pages send a heartbeat
every five minutes; reloads, navigation and multiple tabs share the browser ID.
A returning guest has more than one guest session. These are browser estimates,
not a count of identifiable people. Clearing storage, incognito and a different
device create separate visitors. Existing sessions cannot be reconstructed.

`convertedAt` is set once when a new passkey profile is successfully verified on
a browser that previously used guest mode. An existing account login does not
count. The account identity is not added to the analytics record.

The Admin dashboard shows totals and the 20 latest guest visits. Its endpoint,
`GET /api/admin/analytics`, requires an administrator session. Guest records are
not accessible through the public API. Tracking is disabled for demo and native
mobile builds, and can be disabled per browser in Settings > Privacy. Opt-out
removes the local UUID; enabling again creates a new one. Offline failures are
ignored and do not interfere with guest usage.

## Supabase SQL Editor: guest visit history

```sql
SELECT
  right(key, 10) AS browser_id,
  to_timestamp((value->>'firstGuestAt')::double precision / 1000)
    AT TIME ZONE 'Europe/Bucharest' AS first_guest_visit,
  to_timestamp((value->>'lastGuestAt')::double precision / 1000)
    AT TIME ZONE 'Europe/Bucharest' AS last_guest_visit,
  (value->>'guestSessions')::integer AS guest_sessions,
  to_timestamp((value->>'convertedAt')::double precision / 1000)
    AT TIME ZONE 'Europe/Bucharest' AS account_created
FROM public.opengym_kv
WHERE key LIKE 'analytics:visitor:%'
  AND value->>'firstGuestAt' IS NOT NULL
ORDER BY (value->>'lastGuestAt')::bigint DESC;
```

## Supabase SQL Editor: totals

```sql
SELECT
  count(*) AS unique_guest_browsers,
  count(*) FILTER (WHERE (value->>'guestSessions')::integer > 1)
    AS returning_guest_browsers,
  coalesce(sum((value->>'guestSessions')::integer), 0) AS guest_sessions,
  count(*) FILTER (WHERE value->>'convertedAt' IS NOT NULL)
    AS guest_browsers_that_created_an_account
FROM public.opengym_kv
WHERE key LIKE 'analytics:visitor:%'
  AND value->>'firstGuestAt' IS NOT NULL;
```
