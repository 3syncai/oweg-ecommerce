# Admin startup investigation

Public read-only checks on 30 October 2026 found:

- Login HTML responded in 315 ms; its JavaScript was 6,157,084 bytes and contained the React development runtime and i18next debug initialization.
- A Vercel `/api/admin/feature-flags` request returned 502 after about 30 seconds while the direct backend returned the expected unauthenticated 401 in 359 ms. `/admin/access/me` also timed out once through Vercel. Repeated checks returned 401 in 62–164 ms. This is intermittent upstream/proxy latency, not evidence that every login takes 30 seconds.
- The feature flags query ran on logged-out auth pages. The dashboard query defaults could retry failures.
- The global access UI and several widgets each requested access/me separately. That handler repeated the database-backed lookup already performed by its access middleware.
- The access UI debounced every DOM child change, so ongoing page updates could postpone its first access check. Access fetches had no deadline.

## Changes

The standalone admin build explicitly uses production mode and removes dependency development branches. Vercel builds with `npm run build:admin`, output `.medusa/admin`; hashed asset paths receive immutable browser caching. Login HTML and APIs do not receive long-lived cache headers. The build rejects an entry containing the React development runtime. Only this static build uses ephemeral configuration secrets: it does not start a server, connect to a database or change backend secrets.

An idempotent dashboard patch updates both source and shipped runtime hooks. Feature flags stay disabled on login/reset/invite routes and become enabled when navigation leaves those routes. They have an 8-second read deadline, no automatic retries, and no focus refetch. Authorization is still enforced server-side; feature flags do not grant permissions.

Concurrent access/me reads share an in-flight promise, with no completed-response cache. Changing sessions resets the promise. Read-only custom access requests have a 12-second deadline; mutations are not aborted. The current request's checked actor is reused by access/me, without caching authorization between requests. The DOM scheduler throttles instead of repeatedly restarting its timer. An old session's failed request cannot display an access error on the new login page or postpone the next session's check.

Initial production build: 5,577,860 bytes (1,386,554 gzip), about 9.4% smaller than the live raw entry. React development and i18next debug markers were absent. The dashboard still has a substantial initial bundle; further route/extension lazy-loading needs its own measured review.

## Deployment and verification

Deploy the admin Vercel project and Medusa backend from this revision. Admin Vercel root must be `my-medusa-store`; use its committed build command/output configuration. Keep the same-origin `/api` backend URL and existing rewrite destination. Backend: rebuild and restart `medusa-api` using the normal deployment process. No database migration or payment-worker restart is required for these changes.

After deployment, use a fresh/incognito browser and record a Network waterfall for login and the first authorized page. Confirm no feature-flags request on login, one concurrent access/me request after sign-in, production bundle caching, and correct access for superadmin, restricted roles, forced-password accounts and expired sessions. Do not put passwords/tokens or raw authenticated responses in the report.

Public timing checks cannot establish authenticated login/password-check time or database saturation. No live credentials were submitted during this investigation. If 30-second 502s recur, correlate Vercel request IDs/timestamps with reverse-proxy and backend logs; code changes alone cannot confirm that infrastructure issue is resolved.
