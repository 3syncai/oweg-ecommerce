**Security fixes for readiness findings F01–F03 — 24 October 2026**

Implemented locally after review of revision `300b2b7`. These changes are not yet deployed. The original readiness evidence describes the pre-fix revision; it is retained as historical evidence.

**F01: referral authorization**

Customer-specific affiliate/referral reads and writes now verify the store session through `/store/customers/me`. The verified customer ID determines database scope; optional header/body/query IDs are checked against it. Unauthenticated requests return 401, mismatched IDs return 403, and upstream session-verification failures return 503 before cache/database access.

Covered paths: customer-affiliate `me`, `stats`, `register`, `track-referral`, and the customer-specific portion of `validate`; store `referral-code` and `save-referral`; legacy affiliate referral writes. Registration and tracking use the verified profile rather than caller-supplied email/name. Anonymous generic code validation remains available without personal redemption-history access.

Agent statistics and referral-list GET endpoints (`/api/affiliate/stats` and `/api/affiliate/referrals`) require authenticated server-to-server requests using `INTERNAL_API_SECRET` via `x-internal-api-secret` or the supported Bearer header. There is no verified agent-session implementation in this storefront, and no browser consumers of these endpoints were found in this repository. A public affiliate code is only a query selector. External service consumers must supply the server credential; never put it in browser code or a NEXT_PUBLIC variable.

Legacy `/api/affiliate/referrals` POST delegates to the authenticated locked-referral save operation. Both `referral_code` and its legacy `affiliate_code` alias are supported. The operation serializes choices per customer in a transaction, reads the canonical locked row, and commits the agent/referral records together; changing an already locked code returns 409. Customer-referrer tracking retains its separate existing switching policy, scoped to the signed-in customer. No schema or data migration was run.

**F02: vendor debug controller**

The vendor controller now uses production secret validation matching the storefront: missing, blank and known weak defaults are rejected. Vendor instrumentation checks configuration at Node startup. Development fallback behavior is restricted to development. Set a strong unique `DEBUG_CONTROLLER_SECRET` (or supported `DEBUG_CONTROLLER_TOKEN`) in the hosted vendor portal before rollout. No secret values were generated, printed or changed by this patch.

**F03: shipping webhooks**

Both ITL and Shiprocket authenticate before resolving services or processing payloads. Missing/blank configuration returns 503; absent, incorrect or malformed credentials return 401. Comparison uses constant-time comparison after checking byte lengths. Existing provider header names remain supported: `x-api-key`, `x-itl-webhook-secret` / `x-shiprocket-webhook-secret`, and the corresponding existing `x-*-signature` shared-secret alias. This preserves shared-secret compatibility; it does not add a new provider HMAC-body-signature protocol.

Configure `ITL_WEBHOOK_SECRET` and/or `SHIPROCKET_WEBHOOK_SECRET` on the backend for the providers whose endpoints are used, and configure the matching value on each provider. Local backend configuration was previously missing the ITL secret; no `.env` was edited. Unauthenticated provider dashboard test calls now receive 401, rather than a false success acknowledgment. Confirm provider headers and retry behavior in staging before production rollout.

**Validation**

- `npm run test:security`: 45 isolated regression tests passed. Real handlers execute against mocked session, database and service boundaries; no live data or third-party calls.
- Storefront, vendor and backend TypeScript checks passed.
- Backend unit tests: 105 passed across 15 suites.
- ESLint passed for the changed storefront/test files and vendor auth/instrumentation files.
- Security regression command is included in the CI type-check job.

Tests cover unauthenticated requests, header/body/query identity spoofing, legitimate session reads, public generic validation, locked attribution, rollback/release, trusted service reads, production debug defaults, valid credentials/header aliases, and webhook rejection before shipment-state access. No real-database concurrency test, production build, provider sandbox test or hosted deployment was performed. Broader readiness findings, including load capacity, remain open.
