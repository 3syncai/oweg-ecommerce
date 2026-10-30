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

## Follow-up: authenticated verification and repeated popups

The user subsequently authorized credential checks. No passwords, tokens or cookies are stored in this report.

Direct backend verification passed for the superadmin and the customer, catalog, orders, returns, vendor, marketing and partner subadmins: login/session/access and one assigned-section GET all returned 200. Role administration returned 403 for all seven tested subadmins and 200 for the superadmin. Direct login requests took approximately 133–281 ms in that sample. The supplied accounting credential returned 401 via the admin origin; that account was not reset or changed.

Through Vercel, some successful password checks were followed by session/access timeouts. Two public requests reproduced a 30-second 502 with `x-vercel-error: ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR`, including `/api/health`, which needs no admin credentials or database authorization. Direct backend health requests in the same three-round comparison took 79–269 ms. The error is documented at https://vercel.com/docs/errors/router_external_target_connection_error. Sample request IDs:

- `bom1::tx6wv-1793364142609-31b2155229dc` — health, 30,135 ms.
- `bom1::6zj2q-1793364172784-8737dff86795` — unauthenticated users/me, 30,130 ms.

Hostinger terminal checks confirmed LiteSpeed on 80/443, Node on 9000, local health about 4 ms and public health about 108 ms. Connection limits are 10,000 and per-client rate throttling is disabled. Startup process-limit notices are not proof of the current connection failure. Firewalld is active; further origin/network diagnostics remain necessary. No firewall, reverse-proxy, credential or account settings have been changed.

The earlier UI cleared all verified access after any background refresh failure. Follow-up changes distinguish auth rejection from transient connectivity errors: 401/403 immediately block the UI; temporary failures retain the last server-verified UI for at most 90 seconds from verification, with bounded retry backoff. With no previous verification, or once that window expires, the UI blocks. Every privileged backend request still independently enforces current permissions and token revocation. No permissions are persisted to browser storage. Focus refreshes use the same 30-second cadence rather than triggering extra reads after five seconds.

Login now defaults to the neutral My Access page instead of Orders, avoiding a needless denied-route/full-reload cycle for non-order admins. Empty SDK error messages receive an actionable fallback. Non-JSON errors preserve HTTP status; malformed access responses never grant access. Auth-aware dashboard changes apply to source, ESM runtime and CommonJS runtime.

Follow-up validation: eight startup/refresh regression tests, the existing 80 admin-access tests, backend TypeScript check, changed-file lint and static production build passed. Browser sign-in through the deployed Vercel origin did not complete reliably; this must not be reported as an end-to-end success. These follow-up code changes are local until committed and deployed.
