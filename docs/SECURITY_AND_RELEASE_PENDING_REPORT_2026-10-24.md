# OWEG storefront, vendor portal and backend: security and release status

Review date: 24 October 2026, Asia/Kolkata. Baseline commit: `300b2b7ec293c837e02bf3ffb129f404e9bcd2b0`, with the current uncommitted security and product-edit fixes included in this follow-up review. This document is the **current pending-work register**; the earlier [readiness review](PRODUCTION_READINESS_REVIEW_2026-10-24.md) records the original findings. Finding numbers F01–F20 are retained for continuity; F21–F30 are follow-up findings.

**Release decision: do not approve unrestricted production use yet.** Six earlier findings have local fixes, but they still need staging/deployment verification. Additional critical authorization and credential-exposure issues remain. Capacity for 5,000 concurrent users is unverified. Completing code changes alone is insufficient: production configuration, integration tests, backup recovery and measured capacity must also pass.

This task creates a report and isolated audit probes. It does not fix the newly identified issues, commit, push, deploy, rotate credentials, change cloud permissions or access production databases. No secret values or actual customer records are included in this report.

## Scope and evidence limits

Reviewed source includes storefront API handlers and rendering, service-worker caching, vendor API proxy/session usage, Medusa custom authentication, uploads, reviews, vendor registration/profile flows, database clients, CI and the previous fix implementation. Checks include source searches, narrow tracked-file credential-pattern searches and real source handlers executed with mocked database/provider boundaries.

**Confirmed source defect** means the behavior is present in code. **Mock-reproduced** means a real handler reproduced it using synthetic fixtures. **Conditional** means deployment settings determine exposure. **Unverified** means evidence is still needed. None of these labels means production exploitation occurred.

The hosted build revision, response headers, emitted JavaScript bundles, network responses, bucket policies, IAM permissions, database networking/roles, WAF configuration, logs and backup restoration were not inspected. There was no authenticated hosted browser/DevTools session or live penetration/load test. A publishable Medusa key may be required by framework middleware on store routes; that public browser key is not customer/vendor authentication and does not repair an ownership failure.

Dependency counts below reuse the same-day saved scans; no fresh advisory lookup was run for this follow-up. Narrow credential checks excluded `.env` contents and git history. They do not certify that the repository or bundles contain no other secrets.

## What has already been fixed locally

| ID | Local change | Evidence already obtained | Still required |
|---|---|---|---|
| F01 | Customer referral operations derive identity from verified session; service-only legacy reads require internal secret | Part of 45 passing security regressions | Staging cross-account tests, external service-consumer compatibility, production secret configuration |
| F02 | Vendor debug controller rejects absent/weak production secret and checks configuration at startup | Production-mode isolated tests | Strong hosted secret, startup failure check, deployment |
| F03 | ITL/Shiprocket webhooks reject missing configuration/credentials before service access | Header/configuration regressions | Matching provider/backend secrets, real provider retry and sandbox delivery checks |
| F05 | Single-product SKU and inventory changes are included in save | Payload and PostgreSQL transaction tests | Real Medusa save/reload, reservations and shared-catalog checks in staging |
| F06 | Explicit null removes sale price; omitted value preserves it; reload ignores deleted prices | Payload and transaction tests | Staging storefront/editor price round-trip |
| F07 | One transaction covers product, variant, inventory and price changes; editor uses one save | 14 disposable PostgreSQL tests, including real MikroORM transaction binding | Full Medusa module wiring, failure injection, event/search reconciliation |

See [security fix notes](SECURITY_FIXES_F01_F03_2026-10-24.md) and [product-edit fix notes](PRODUCT_EDIT_FIXES_F05_F07_2026-10-24.md). These changes are **implemented locally**, not closed as deployed controls. The product transaction defers module events/search effects until after commit; external delivery is not an atomic PostgreSQL operation.

## Highest-priority new findings

### F21 — Critical: vendor profile/reapplication trust unverified JWT contents

**Confirmed and mock-reproduced. Open.** `my-medusa-store/src/api/store/vendors/me/route.ts:6` and `store/vendors/reapply/route.ts:50` split a token and decode its payload without checking its signature, expiry or vendor scope. Both Authorization and fallback vendor-token headers use this logic. The portal calls these routes through `vendor-portal/lib/api/client.ts`.

The profile route returns the selected complete vendor record. The vendor model includes account number, IFSC, PAN/GST, phone/address, documents and internal metadata. A synthetic unsigned token reached the lookup and received synthetic banking/tax fields with HTTP 200. This is an unauthorized disclosure path, even when those fields are absent from the visible page.

Reapplication accepts banking, tax, document and store fields using the same unverified identity. The real service allows reapplication **only for rejected vendors** (`modules/vendor/service.ts:334`); therefore the demonstrated route bypass is not proof that approved-vendor bank details can be changed through this operation. An unsigned token reached the mocked update service; no real record was changed.

Required fix: use shared cryptographic vendor verification, validate typed claims and the active vendor-user association, preserve the rejected-vendor business rule, return an explicit response allowlist, and audit sensitive changes. A public key, hidden URL or UI login redirect cannot replace this control. Reject unsigned, malformed, expired, wrong-scope and other-vendor tokens before resolving vendor data. Treat current hosted exposure as unknown until the route is checked safely.

### F22 — High: public reviews expose email/customer identifiers and pending reviews

**Confirmed and mock-reproduced. Open.** `my-medusa-store/src/api/store/products/[id]/reviews/route.ts:45` selects `*` and returns entire rows at line 78. It includes both approved and pending rows without restricting pending rows to their author. Review writes contain `reviewer_email` and `customer_id`; synthetic values survived the public GET. The storefront review proxy forwards the response.

Required fix: public response fields should explicitly include only approved display content, display name, rating, media and appropriate timestamps/counts. Omit reviewer email, customer ID and private/internal fields. Serve an author's pending reviews only through verified owner scope. Add anonymous, owner, non-owner and pagination tests. Hiding these fields with CSS or omitting them from React rendering does not protect the Network response.

### F23 — High: payment-status lookup has no ownership binding

**Confirmed and mock-reproduced. Open.** `src/app/api/checkout/razorpay/status/route.ts:6` accepts a caller-supplied payment ID and fetches provider data with server credentials. It returns status, amount, currency, method, provider order ID and error details without a customer/session/order-access check.

A synthetic unauthenticated call reached the mocked provider lookup and returned HTTP 200. An attacker would still need a valid payment ID; this is not a claim that IDs are easily enumerable or that funds can be moved through this endpoint. It creates unauthorized payment information access and third-party quota amplification.

Required fix: bind lookup to an authorized checkout/order/customer or a narrowly scoped, expiring guest-checkout capability; verify payment-to-order binding server-side. Apply rate limits, return minimum status fields, redact provider errors, and use `Cache-Control: private, no-store`. Test absent/wrong owner and leaked payment-ID scenarios. The separate order-summary GET already calls an order-access helper; apply equivalent protection consistently.

### F30 — Critical if credentials were valid: database credentials embedded in tracked files

**Tracked credential literals confirmed; validity and historical access unverified. Open.** A limited scan found nonempty remote-looking database credential fallbacks in:

- `my-medusa-store/src/scripts/sync-prices-advanced.ts:22` and its PostgreSQL connection fallback around line 27.
- `my-medusa-store/src/scripts/debug-oc-sample.ts:11`.
- `my-medusa-store/scripts/migrate-opencart-to-medusa.js:27`.
- A credentialed PostgreSQL example in `my-medusa-store/DEPLOYMENT.md:139` needs classification as a placeholder or previously valid credential.

Values are deliberately omitted. These are script/source exposure findings, not evidence that Next.js delivered a database password to browsers. Scripts can still leak through repository access, history, copies, build artifacts or logs. OpenSearch also has an `admin` credential fallback (`src/lib/opensearch.ts:7`); runtime danger depends on configuration/reachability.

Required fix: remove operational credential literals; require environment/secret-manager configuration and least-privilege script identities. **If any credential was ever valid, rotate/revoke it and examine access logs.** Removing it from the current file does not revoke a value copied from history. Run a full secret scanner across tracked files, history, generated artifacts and deployment bundles; classify false positives without reproducing values in tickets/logs. Any history rewrite needs a separate coordinated repository decision. Verify database endpoints are private or tightly restricted.

## Complete remaining finding register

The closure evidence is part of the work, not an optional final check. Existing IDs below describe still-open mechanisms in the current workspace. Priority is contextual: P0/critical issues block public exposure, P1/high issues block broad release, P2/medium controls should be implemented or explicitly risk-accepted with evidence and an owner.

| ID | Priority / status | Pending issue and source | Required closure evidence |
|---|---|---|---|
| F04 | P0; scan-confirmed, applicability untriaged | Critical/high dependencies across three lockfiles; saved audit files | Reachable advisory triage, compatible upgrades, clean/resolved critical runtime findings, three production builds and regression tests |
| F08 | P1; confirmed | ITL searches only 500 fetched orders; Shiprocket has broad incomplete lookup (`api/custom/*/webhook/handler.ts`) | Indexed unique provider/shipment lookup, durable unmatched events, match an old order beyond initial page |
| F09 | P1; confirmed rule, browser impact unverified | `src/sw.ts:13` applies NetworkFirst `oweg-api` cache to all API paths; logout leaves Cache Storage | Private endpoints NetworkOnly; public allowlist; purge legacy cache; A→logout→B offline/slow-network test |
| F10 | P1; confirmed | Vendor image/video multipart buffers lack explicit size/count bounds; proxy buffers again | Stream/presign with bounded bytes/count/dimensions, decoded media checks, quota/concurrency and failure cleanup tests |
| F11 | P1; confirmed | Vendor bearer tokens last 24 hours; logout/password change do not revoke them; shared guard does not enforce reset state | Revocable sessions/token version, active-user checks, reset-state enforcement, copied-token rejection after logout/reset |
| F12 | P1; app gap confirmed, edge unknown | Vendor password login has no application throttle (`api/vendor/auth/login/route.ts`) | Distributed IP/account limits, backoff, generic errors, realistic multi-instance abuse tests and alerts |
| F13 | P1; conditional | Logistics configuration can select dummy provider on absent/unrecognized mode | Production fail-closed provider/mode validation; live-provider readiness and sandbox lifecycle evidence |
| F14 | P2; confirmed | TLS certificate verification disabled in DB/OpenSearch clients | Correct CA trust, certificate validation enabled, invalid-cert rejection, network/role review |
| F15 | P2; confirmed | Read-only/checkout-disable controls applied mainly in frontend middleware; mutation bypasses remain | Backend policy enforcement with explicit webhook/recovery exemptions; direct API mutation tests |
| F16 | P1; conditional | Coin-expiry cron authenticates only if secret is configured; GET mutates (`src/app/api/cron/expire-coins/route.ts:25`) | Fail closed, authenticated scheduler, bounded idempotent batches, unauthenticated requests do zero DB work |
| F17 | P1; confirmed workload | Vendor 10-second pulse polling triggers history hydration and repeated global earnings updates | Read-only scoped/cached counters; worker-driven transitions; no overlap/jitter; query and load evidence |
| F18 | P1; confirmed | Vendor products/orders paginate after broad retrieval | Ownership/search/pagination in database; lightweight list payloads, indexed counts, large-history query plans |
| F19 | P1; confirmed pattern | Several per-request/operation pools remain despite shared helpers | Reused bounded pools, fleet-wide connection budget/pooler, query/acquisition deadlines, pool-wait metrics |
| F20 | P2; confirmed | Vendor settings network hops and upstream proxy lack explicit deadlines; buffered bodies | Abort deadlines, bounded retries/body sizes, tracing and failure-under-load tests |
| F21 | P0; mock-reproduced | Unsigned vendor profile/reapplication identity | Verified session/token and owner checks; rejected-state rule; minimal responses; negative tests |
| F22 | P1; mock-reproduced | Public review email/customer ID and pending-content exposure | Public response allowlist and approved-only visibility; author-private pending route |
| F23 | P1; mock-reproduced | Payment status accessible using payment ID alone | Authorized checkout ownership/capability binding; minimal response and rate limit |
| F24 | P2; mock-reproduced | Public flash-sale debug and raw error responses disclose internals | Remove/disable debug routes on backend and proxy; generic error plus correlation ID, server-only redacted logs |
| F25 | P1; confirmed source, cost threshold unmeasured | Affiliate document/review media upload routes lack verified user boundary and explicit upload limits | Authenticated owner or expiring signup capability; byte/count/type limits, tenant quota, abuse controls |
| F26 | P1; conditional confidentiality risk | KYC/bank docs use upload paths returning ordinary object URLs; bucket policy unknown; caller-supplied doc references can later be signed | Private KYC storage, ownership-bound keys/signing, short-lived URLs, cross-vendor and anonymous S3 access-denial tests |
| F27 | P2; confirmed configuration | Vendor has no explicit application security headers; storefront script CSP allows unsafe-inline | Hosted header verification; vendor CSP/framing/nosniff/HSTS; nonce/hash CSP migration tested with payment/theme scripts |
| F28 | P2; confirmed CORS patterns, CSRF exploit unverified | Several store/affiliate handlers reflect arbitrary Origin with credentials; global middleware forces SameSite=None | Exact production-origin allowlist; review preview domains; Origin/CSRF protection for cookie-auth mutations; browser hostile-origin tests |
| F29 | P1; confirmed | Review POST permits null customer and writes approved status immediately while response says pending | Backend authentication/moderation policy, spam/rate/length/media constraints, consistent actual/returned status |
| F30 | P0 if credentials valid; source confirmed | Tracked hardcoded database credential fallbacks | Remove literals, classify/rotate/revoke, investigate access, full history/artifact secret scan and restricted DB network |

F16 is treated more urgently here than in the original report because it is a financial scheduled mutation and unauthenticated work trigger when misconfigured. F25 extends the original upload finding beyond authenticated product media. F24/F26/F27/F28/F29 make previously broad risks explicit; their severity does not imply every possible exploit was reproduced.

## Database security assessment

**SQL injection:** the sampled referral and review queries use PostgreSQL value parameters; no working SQL injection was established. Some affiliate catalog code dynamically constructs identifiers from discovered schema metadata. Review that code for identifier allowlisting/quoting and verify no request field selects SQL fragments. A source search is not a complete injection assessment. Test filters/sorts/IDs and import paths against an isolated database with hostile input; never interpolate user text into SQL.

**Authorization:** F21 is a database data-access problem even though SQL parameters are used correctly. Parameterization prevents SQL syntax injection; it does not ensure the caller may read or change the selected vendor. F01 fixes only the listed referral paths, not every custom handler. Audit every customer/vendor/admin route and background job for ownership and field-level response minimization. Include deleted, rejected, suspended and reset-required users.

**Transport/network:** `src/lib/affiliate-pg.ts:54`, `my-medusa-store/src/lib/db-pool.ts:20`, vendor debug DB and some payment helpers disable TLS verification under their selected SSL configuration. Supply the managed database CA and verify certificates; confirm provider URL options do not weaken the result. Production PostgreSQL/OpenSearch/Redis should not be openly reachable. Security groups/firewalls, public accessibility and actual TLS negotiation remain unverified.

**Privileges/schema:** runtime checkout helpers contain CREATE TABLE/INDEX. Move schema creation into controlled migrations; separate runtime read/write accounts from migration/admin roles. Verify the runtime role cannot create/drop schemas, change roles, read unrelated databases or bypass intended tenant boundaries. PostgreSQL RLS may provide defense in depth if deliberately integrated with connection pooling; its existence/enforcement was not established. Do not assume enabling RLS without a tenant-context design is sufficient.

**Availability:** shared pools are capped per process, not per deployment. Some paths create clients/pools for each operation, and fleet scaling multiplies connections. Global pulse writes, broad history reads and long-running transactions can exhaust the same database needed by checkout. Measure locks, query plans, pool waits and statement durations with realistic data. Reserve capacity for workers/recovery/admin traffic.

**Integrity/recovery:** local product atomicity is improved; full payment/stock/payout integration still needs staging. Test final-unit stock races, double webhooks, simultaneous referral registration, retries after timeouts and restarts. Confirm encrypted backups/PITR, retention, access, a recent isolated restore drill and explicit recovery time/data-loss objectives. A configured backup is not a proven restore.

## XSS, browser sessions and CSRF

The inspected product-description HTML renderers call `sanitizeProductHtml`, which uses DOMPurify with a narrow tag list and only colspan/rowspan attributes (`src/lib/sanitize-product-html.ts`). Product JSON-LD serialization escapes `<` (`src/lib/seo.ts:135`). The inspected theme-bootstrap and admin-branding HTML are static code, not demonstrated untrusted input. **No working stored/reflected/DOM XSS was reproduced in this review.**

That is not an XSS clearance: saved audits include sanitizer dependency findings; those packages must be patched/triaged. Test product descriptions, reviews, vendor/store policies, filenames, notices/messages and admin views against an updated sanitizer and real browser. Check URL schemes, SVG/HTML uploads, rich text and hydration paths. React's ordinary text escaping is useful, but unsafe HTML, URL handling and raw uploaded documents need separate controls.

The storefront CSP permits inline scripts. Vendor `next.config.ts` defines no matching headers, although a host may supply them. Confirm actual production responses before claiming CSP protection. Migrate to nonces/hashes without breaking Next, theme initialization or Razorpay; deploy a tested policy. A CSP reduces consequences but does not replace sanitization or authorization.

Vendor tokens live in browser-accessible localStorage and a JavaScript-set cookie. Any successful same-origin script injection can read the localStorage token. Prefer server-managed HttpOnly, Secure sessions with explicit CSRF protection and revocation; review all consumers when migrating. Cookie expiry/browser logout alone does not revoke a copied token.

Several handlers echo the requesting Origin and permit credentials; other handlers use `*` plus credentials, which browsers reject for credentialed reads. Those patterns do **not** by themselves demonstrate account compromise: Bearer tokens are not automatically attached by a hostile site, and cookies have additional browser restrictions. Nevertheless, review all cookie-authenticated mutations, enforce trusted Origin/CSRF tokens where appropriate, and reject unsafe form/text content types. Global SameSite=None cookie rewriting increases the importance of that review. CORS is a browser response-reading policy, not protection from curl or server-to-server requests.

## DoS and cost-abuse assessment

No saturation attack was run. The source establishes several amplification mechanisms:

| Entry point | Resource/cost at risk | Necessary controls |
|---|---|---|
| Vendor image/video; affiliate/review uploads | Multiple buffered copies, Node memory, S3 writes, storage and egress | Streaming/presigned uploads, strict request and decoded dimensions, quotas, expiring capabilities, cancellation |
| Vendor login | Password hashing CPU and account guessing | Shared account/IP throttles, progressive backoff, generic errors and credential-stuffing alerts |
| Vendor pulse | Broad reads, repeated global UPDATEs, locks | Read-only precomputed counters, scoped worker updates, cache/coalescing, in-flight gate and jitter |
| Search/list/reviews | OpenSearch/DB CPU, large response and connection occupancy | Maximum page/query lengths, indexed plans, bounded pagination, shared limits and timeouts |
| Payment status | Provider quota/latency and server-held credential use | Authorization before provider call, status cache where safe, per-order/user limits, provider deadlines |
| Cron and webhooks | Financial/shipment work amplification, duplicate retries | Fail-closed auth, event idempotency, bounded queue/batches, replay handling and unmatched-event reconciliation |
| Proxy/settings | Hanging upstream work and buffered memory | Deadline/cancellation propagation, bounded body/response sizes, circuit breaking and observability |

Customer OTP/password-reset code already contains separate throttling; this report does not claim that all authentication is unthrottled. Edge WAF/DDoS rules are unverified. A CDN can protect cacheable reads, but it cannot make expensive authenticated writes safe. Do not rely only on frontend debounce or a process-local limiter in a multi-instance deployment.

At 5,000 visible vendor tabs and a 10-second interval, pulse alone produces approximately 500 requests/second; its repeated synchronization substantially increases DB work. This is arithmetic, not a measured capacity result. Define the shopper/vendor/checkout mix before sizing or load testing.

## Is data leaking in browser Inspect/Network?

**There are confirmed source-level disclosure paths, but no hosted browser capture or production leak incident was verified.** The six follow-up probes use synthetic records only. Browser DevTools can always show data sent to that browser. Protection must happen before constructing the server response.

| Data visible to browser | Assessment |
|---|---|
| Product names, public price/images, category IDs, storefront/backend public URL | Normally intentional; still minimize internal catalog metadata |
| Medusa publishable key, Razorpay public key ID, public asset bucket hostname | Expected public configuration; not equivalent to a DB/AWS/Razorpay secret |
| Signed-in user's own profile/address/order details | Expected only for verified owner, with minimal fields and no shared cache |
| Vendor bearer token in localStorage/JS-readable cookie | Observable by that browser and same-origin JavaScript; increases XSS consequences (F11/F27) |
| Another vendor's account/PAN/doc references via unverified profile token | Unauthorized disclosure path confirmed with fixture (F21) |
| Reviewer emails/customer IDs and pending content on public review GET | Unnecessary public data exposure confirmed with fixture (F22) |
| Payment facts from a supplied payment ID without order ownership | Authorization gap confirmed with fixture (F23) |
| Flash-sale debug state, stack traces, proxy backend URL/raw error text | Unnecessary information disclosure; fixture confirmed stack (F24) |
| Private API responses in the service-worker Cache Storage | Privacy/staleness risk from broad rule; cross-account offline leak not yet browser-reproduced (F09) |
| DB password, JWT/internal secrets, AWS secret, Razorpay secret | Must never be delivered; source credential literals found (F30), emitted bundle exposure not established |

**Required hosted inspection before approval:** use synthetic accounts A/B plus vendors A/B and an admin. Inspect Document/HTML, React server payloads, JS chunks, Network response bodies/headers, Application storage/Cache Storage, cookies and console. Exercise login/logout/account switching, private pages, error states and offline/slow network. Verify B cannot get A's records using known IDs. Scan downloaded emitted artifacts for secret patterns with values redacted; exclude intentional publishable keys from false positives. Authenticated responses should be private/no-store at server/CDN/browser layers and excluded from the service worker.

For documents, an S3 object URL alone does not prove public read access; bucket policy determines that. Separate KYC/bank uploads from public product media. Current signup/affiliate uploads return ordinary URLs without proving private policy, and caller-supplied document references can be persisted then signed by admin views (`my-medusa-store/src/lib/s3-access.ts` and `my-medusa-store/src/api/admin/vendors/[id]/route.ts`). Validate every key against the authenticated owner and allowed prefix before storage/signing; arbitrary object references must not gain a fresh signed URL. This potential signing abuse is a risk to test, not a reproduced cross-vendor object disclosure.

Production logs need an independent privacy review. Commission handlers log request bodies, order-cancellation webhook logs payloads and many catches log raw errors. Confirm that tokens, credentials, full bank numbers, KYC URLs, addresses and provider payloads are redacted or omitted; use correlation IDs and restricted log access/retention. Logging header **names** or token **lengths** is not the same as logging secret values.

## Dependencies, tests and CI status

Saved `npm audit --omit=dev` package-entry counts from this date:

| Project | Critical | High | Moderate | Low |
|---|---:|---:|---:|---:|
| Storefront | 2 | 15 | 1 | 0 |
| Vendor | 2 | 9 | 3 | 0 |
| Backend | 4 | 63 | 110 | 1 |

Counts are affected package entries, not independent exploitable vulnerabilities. Runtime applicability must be reviewed; backend production graphs also contain admin/build dependencies. Saved detailed advisories are in `docs/review-evidence/2026-10-24/{store,vendor,backend}-audit.json`. Use a fresh scan after coordinated supported upgrades, prioritize reachable framework/sanitizer/parser vulnerabilities and avoid blanket forced upgrades. Spreadsheet parsing (`xlsx`) requires particular attention to malicious file/CPU/memory tests and supported distribution choices.

Previously completed checks on the local fixes: 45 security regressions; 14 disposable PostgreSQL transaction cases; 122 vendor tests; 105 backend unit tests; storefront/vendor/backend TypeScript passes as recorded in the fix notes. PostgreSQL cases use mocked module boundaries plus one real manager-binding check, not a fully booted Medusa integration. Original additional storefront/admin/gallery groups remain historical evidence; they were not rerun for this report-only task.

This follow-up ran `node scripts/readiness-exposure-probes.cjs`: **six synthetic observations** across unsigned vendor read, unsigned reapplication, public review fields, pending review visibility, payment lookup and stack disclosure are recorded in [follow-up evidence](review-evidence/2026-10-24/followup-exposure-probes.json). The JSON contains five result objects because the review object records two observations. These are audit reproductions of insecure behavior, not passing regression tests asserting that the system is secure. After fixes, add negative regression expectations and rerun; update this evidence rather than assuming these findings remain exploitable.

Current CI runs root lint/type/build and the newly added security suite. It still does not gate vendor/backend type/lint/build/tests or the explicit PostgreSQL transaction tests. Original vendor lint failed with 110 errors/7 warnings; its full lint was not rerun after the product patch. Existing lint errors are not automatically vulnerabilities, but a partial CI gate is not release evidence. Preview `--prebuilt` output/artifact mismatch also remains unverified.

## Ordered work and approval gates

| Order | Required work | Approval artifact |
|---|---|---|
| 1 — Contain critical access | Fix F21; classify/remove/rotate F30 credentials; deploy existing F01–F03 safely; triage F04 | Unauthorized/cross-vendor tests; rotation/access review without secrets; matched webhook settings; reviewed dependency decisions |
| 2 — Stop unnecessary disclosure | Fix reviews/payment ownership/debug errors; sensitive-cache exclusion/purge; private owned documents | Response field tests; two-account DevTools/offline evidence; anonymous/cross-vendor S3 denial |
| 3 — Prevent abuse/session reuse | Bounded uploads, quotas, login/distributed rate limits, revocation/reset enforcement, cron fail-closed, CORS/CSRF/headers | Abuse limits, revoked-token tests, hostile-origin tests, safe failure under provider/network delays |
| 4 — Ensure business consistency | Indexed shipment match, explicit live logistics, staged product-edit verification, idempotent payment/refund/stock/reward/payout flows | Sandbox lifecycle recordings; historical webhook test; rollback/replay/concurrency assertions and reconciliation |
| 5 — Fix DB/operational amplification | Read-only pulse, DB pagination/indexes, shared pool budgets, TLS/roles, migration-only DDL, deadlines, persistent Redis/workers | Query plans, connection/queue budgets, real TLS/network/role checks, worker heartbeat and dead-job recovery |
| 6 — Gate the entire repository | Three-project clean installs/type/lint/build, meaningful unit/integration/security suites; production-equivalent staging | CI linked to exact release commit, migration and deployment rehearsal, no unexplained skipped required checks |
| 7 — Prove deployment and capacity | Hosted ownership/DevTools inspection, backups/PITR restore, 5,000-session workload ramp/soak/failure tests | Metrics, data-integrity reconciliation, restore timings, rollback runbook and explicit release sign-off |

For load approval, record hardware/replicas, database connection/IOPS limits, Redis persistence/topology, OpenSearch resources, CDN cache ratios and third-party quotas. Ramp 100→500→1,000→2,500→5,000 active sessions with realistic history and hot products; test shoppers and vendor polling separately, cold/warm caches, a 30–60 minute target plateau and multi-hour soak. Include provider timeout, backend/worker restart, DB/Redis interruption and final-unit stock contention. Use synthetic staging data and sandbox providers.

Proposed initial service gates, to agree with the business: under 1% unexpected HTTP errors; dynamic browsing API p95 under 1 second; checkout API p95 under 2 seconds excluding external user/payment interaction; no lost/duplicate financial effects or oversell; bounded memory, pool waits and queues; recovery and reconciliation complete within agreed targets. These are targets, not measured results or guarantees. Keep capacity headroom and an exercised rollback path.

**Production approval requires all of the following to be recorded against the exact release commit:** no unresolved critical/high reachable security finding; accepted and owned lower-risk exceptions; verified secret rotation/configuration; successful full CI/builds and staged end-to-end flows; verified hosted privacy/access behavior; working worker/queue/provider modes; restore/recovery evidence; load evidence for the promised workload; monitored rollout and rollback owner. A smaller pilot needs an explicit lower workload and guardrails; it does not waive authorization/privacy blockers.

Pushing reviewed fixes to a development branch is different from approving production deployment. Once all release gates pass, use a staged deployment: backend first for atomic product editing, then vendor portal and storefront; validate secrets and provider settings before traffic, run smoke checks, monitor errors/queues/reconciliation and roll back on agreed triggers. No report can promise the absence of every future bug or attack.
