**OWEG ecommerce and vendor portal — production readiness review**

**Current status:** use the [follow-up security and pending-release report](SECURITY_AND_RELEASE_PENDING_REPORT_2026-10-24.md) for the current workspace, newly confirmed vendor/review/payment disclosure findings, database/XSS/DoS coverage and release gates. This document below preserves the original review evidence and subsequent local-fix annotations.

Review date: 24 October 2026 (India). Reviewed revision: `300b2b7ec293c837e02bf3ffb129f404e9bcd2b0`, branch `vishal-new`.

**Product-edit remediation update:** F05–F07 now have local code fixes and regression tests; deployment/staging verification remain pending. See [product-edit implementation and rollout notes](PRODUCT_EDIT_FIXES_F05_F07_2026-10-24.md).

**Local remediation update:** F01–F03 have subsequent code fixes and regression tests; deployment and provider-secret configuration are still pending. See [implementation and rollout notes](SECURITY_FIXES_F01_F03_2026-10-24.md). The findings and evidence below describe the original reviewed revision.

**Decision: do not approve a broad production launch or certify 5,000 concurrent users yet.** The application has useful payment safeguards and passing automated tests, but there are confirmed authorization and product-edit defects, unsafe configuration defaults, dependency advisories, and significant database amplification in vendor workflows.

This is a source-code review with local checks, mocked security probes, and current dependency scans. It is not a penetration-test certificate, an exhaustive list of every defect, or a completed production load test. No production customer records were queried or modified for this review. Application fixes, deployments, dependency upgrades, and migrations were not performed. Only this report and its supporting review artifacts were added.

The current production deployment revision, backend instance sizes/count, PostgreSQL limits, Redis topology, OpenSearch size, CDN cache ratios, traffic mix, and production metrics are unconfirmed. The reply to the infrastructure question did not provide those details. Fetching the public storefront timed out in the web tool, and the vendor domain was inaccessible to that tool; neither result proves an outage. An interactive browser was unavailable in this session. Therefore authenticated hosted journeys, layout, mobile behavior, and deployment parity were not verified.

**What passed, and what did not**

| Check executed | Result | Scope and limitation |
|---|---|---|
| Storefront `npm run type-check` | Pass | Compile-time check; does not verify business behavior |
| Vendor `tsc --noEmit --incremental false` | Pass | Vendor project |
| Backend `tsc --noEmit --incremental false` | Pass | Backend project; test directories excluded by its tsconfig |
| Storefront ESLint | Pass, 22 warnings | Existing image/link/hook warnings remain |
| Vendor ESLint | Fail: 110 errors, 7 warnings | Includes explicit `any` and unused variables; not 110 proven runtime bugs |
| Vendor `node --test tests/*.test.mjs` | 113 passed | API contract, bulk submission/upload, pricing, optional size |
| Backend unit Jest suite | 105 passed in 15 suites | `*.unit.spec.*` selection; not all backend `*.test.ts` files |
| Backend admin access suite | 80 passed | Local policy and related regressions |
| Selected storefront unit tests | 63 passed | Search, security headers, return errors, product grouping |
| Product gallery tests | 4 passed | Gallery interaction harness |
| Capture validation script | Pass | Exact payment binding, amount/currency and captured-state assertions; no live charge |
| Mocked security probes | 3 confirmed | Header-based access and vendor debug fallback; no network/database access |
| Full production builds | Not run in this review | Build-time data access and deployed environment not isolated |
| Real PostgreSQL payment integration suite | Not run | Scripts create schemas using configured DB; separate disposable database required |
| End-to-end checkout/refund/fulfillment | Not run | Requires staging accounts and payment/logistics sandbox |
| 5,000-user load/soak/failover test | Not run | No measured capacity claim is justified |

The five counted automated test groups above total **365 passing tests**, plus the capture-validation assertions and three mocked security probes. Passing these tests does not override the findings below.

**Findings that block release**

Priority definitions: P0 = resolve or contain before broad public exposure; P1 = high priority before launch or scale; P2 = operational hardening. “Confirmed” means source evidence or an isolated reproduction. “Conditional” means the behavior is confirmed but deployed exposure depends on configuration. “Risk” means an identified failure mechanism still needs a staging reproduction.

**F01 — P0 — Caller-controlled identities authorize referral reads and writes. Confirmed.**

Evidence: `src/app/api/customer-affiliate/stats/route.ts:18`, `src/app/api/affiliate/referrals/route.ts:11` and `:99`, `src/app/api/customer-affiliate/register/route.ts:60`, `src/app/api/customer-affiliate/track-referral/route.ts:25`, `src/app/api/store/save-referral/route.ts:14`. Related `/customer-affiliate/me` and `/affiliate/stats` paths also warrant the same remediation.

These handlers accept a customer ID, affiliate code, or referred customer ID from headers/body and query or update records without deriving the acting identity from a verified session. A public referral code is not an authentication credential. The root middleware does not add customer authorization to these handlers. Mocked requests with no session reached the database and returned fixture referral records.

Impact: unauthorized reading of referral/commission information and possible referral-attribution tampering. Email masking does not prevent exposure of names, customer IDs, order information, and balances. A code guess or known ID should never authorize access.

Fix: derive the customer or affiliate identity from the verified server session; enforce resource ownership at each handler; allow referral attribution only for the authenticated customer and enforce the intended lock policy transactionally. Add unauthenticated, cross-customer, cross-affiliate, and replay tests. Assess existing logs and attribution history without assuming exploitation occurred.

**F02 — P0 — Vendor debug controller accepts a hardcoded fallback secret in production. Conditional; reproduced.**

Evidence: `vendor-portal/lib/debug-controller/auth.ts:6`; consumers include `vendor-portal/app/api/debug-controller/auth/route.ts` and `settings/route.ts`.

If both configured secret variables are absent, the vendor controller uses a predictable source-code fallback even in production. An isolated production-mode probe confirmed that fallback is accepted. Its settings API can change site controls. The storefront already has a stronger fail-closed implementation in `src/lib/debug-controller/auth.ts`; the vendor copy diverged.

Fix: remove production fallback behavior, reject known weak values, and fail closed when unconfigured. Prefer admin-session authorization with audit logging. A vendor `.env` secret exists locally, but that neither proves the hosted value is strong nor removes this deployment footgun.

**F03 — P0 — Shipping webhook authentication fails open when a secret is absent. Conditional.**

Evidence: `my-medusa-store/src/api/custom/itl/webhook/handler.ts:19` and `custom/shiprocket/webhook/handler.ts:24` both return authenticated when their secret is unset.

These handlers process shipment-state changes and delivery-related follow-up work. The backend local `.env` lacks `ITL_WEBHOOK_SECRET`; production configuration remains unverified. An endpoint should not become unauthenticated because deployment configuration is incomplete.

Fix: require a nonempty production secret/provider signature; fail startup or return a configuration error; validate event identity and shipment ownership; implement durable, idempotent event handling. Do not infer that every financial effect can be forged without separately verifying transition and order-state checks.

**F04 — P0 — Production dependency graphs contain critical/high advisories. Scan-confirmed; runtime applicability requires triage.**

Fresh `npm audit --omit=dev --json` results:

| Project | Critical | High | Moderate | Low | Total affected package entries |
|---|---:|---:|---:|---:|---:|
| Storefront | 2 | 15 | 1 | 0 | 18 |
| Vendor portal | 2 | 9 | 3 | 0 | 14 |
| Medusa backend | 4 | 63 | 110 | 1 | 178 |

These are npm affected-package counts, not distinct vulnerabilities, demonstrated exploits, or independently additive incidents. Transitive entries share advisories. Production dependency graphs may also contain admin/build tooling; runtime reachability must be assessed individually.

Relevant locked versions include storefront Next.js 16.2.4, vendor Next.js 16.1.6, storefront Axios 1.16.0, vendor Axios 1.13.3, backend Axios 1.13.2, and vendor/backend `xlsx` 0.18.5. The scan identifies critical findings in Next.js and DOMPurify; the backend also reports critical entries in MikroORM core, fast-xml-parser, protobufjs, and proxy-addr.

Next.js publisher advisories cover middleware bypass and image-optimization vulnerabilities. The image advisory's possible RCE depends on an affected image-processing path on glibc Linux: this review did not demonstrate RCE. Storefront image optimization is disabled by default in `next.config.ts`, which narrows that path; it does not address other advisories. Vendor image configuration differs. See the [Next.js middleware advisory](https://github.com/vercel/next.js/security/advisories/GHSA-26hh-7cqf-hhc6) and [image-optimization advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw).

The legacy npm `xlsx` release is affected by a documented parsing ReDoS; the scan offers no automatic npm fix for that package. See the [SheetJS publisher advisory](https://cdn.sheetjs.com/advisories/CVE-2024-22363).

Fix: triage reachable runtime findings first, upgrade supported framework/package families together, test import/render/upload/payment behavior, and rerun scans. Review transitive Medusa/admin dependencies as a coordinated upgrade. Do not blindly run `npm audit fix --force`: suggested resolutions include breaking changes and even a Serwist downgrade. The companion JSON preserves scan results and advisory links.

**Correctness, security, and reliability defects**

**F05 — P1 — Single-product SKU and stock edits are not saved. Confirmed code defect.**

Evidence: `vendor-portal/app/products/[id]/page.tsx:483`, `:539`, and its PUT payload around `:545`.

The editor exposes SKU and stock and marks variant-row changes as pending. Matrix saving only runs when `hasVariants` is true. For a single product, the subsequent product PUT includes price and metadata but neither SKU nor inventory quantity; the UI then records those rows as saved. Sellers can receive a success state and lose these edits after reload.

Fix: explicitly update the default variant and its inventory, validate its SKU, and mark form baselines saved only after all requested fields persist. Add a round-trip test that changes only SKU, only stock, and both together.

**F06 — P1 — Clearing a sale price does not reliably remove it. Confirmed code defect.**

Evidence: `vendor-portal/app/products/[id]/page.tsx:407` falls back to the original discounted price when the row is blank; `:558` sends `undefined` if no discounted value remains. Backend `my-medusa-store/src/api/vendor/products/[id]/route.ts:171` treats null/undefined as no update, and its price section only upserts sale prices.

Fix: distinguish “unchanged” from “explicitly remove sale”; support a documented null/delete operation and test that reload shows MRP only. Do not reuse an old sale value when the seller deliberately clears the field.

**F07 — P1 — Product editing uses multiple writes without one atomic save. Confirmed partial-save mechanism.**

Evidence: matrix PATCH followed by product PUT in `vendor-portal/app/products/[id]/page.tsx:507`; matrix baselines are updated before the second request succeeds.

A successful first request and failed second request can leave variants changed while product details/images/approval metadata are incomplete. The UI can present a failed save although some edits persisted.

Fix: one backend update operation/transaction covering the intended product and variant changes, or a durable staged edit submission with explicit partial-state recovery. Inject a second-write failure in staging.

**F08 — P1 — Shipping webhook lookup can miss valid orders as the store grows. Confirmed lookup limitation.**

Evidence: ITL handler `:71` loads only 500 orders and searches in memory. Shiprocket handler `:95` calls `listOrders({})` without an explicit complete indexed lookup or pagination loop.

An order outside the fetched window cannot be matched by its AWB through this code. ITL responds with an acknowledged but unmatched event; the provider may treat delivery as successful and stop retrying.

Fix: indexed lookup by provider/AWB/shipment identity, with vendor association and uniqueness; durable unmatched-event storage and reconciliation. Test with the target order beyond the first 500 records. This issue is about accumulated order volume, independent of concurrent users.

**F09 — P1 — All API GETs are eligible for service-worker offline caching. Confirmed configuration; privacy/staleness impact needs browser testing.**

Evidence: `src/sw.ts:13` matches all `/api/` paths with NetworkFirst and a 10-second fallback. `src/app/api/medusa/auth/session/route.ts` returns account data; logout cleanup at `src/lib/client-session-cache.ts:19` clears React Query/storage but not the `oweg-api` Cache Storage cache.

Account/session/wallet responses can enter the same URL-based cache used for public APIs. During network failure or delay, stale account responses may be returned. No cross-account disclosure was demonstrated in a real browser, and response Vary behavior can affect matching.

Fix: NetworkOnly for auth, session, customer, cart, wallet, checkout, order, payment, and admin APIs; cache only an explicit public-catalog allowlist. Purge legacy sensitive service-worker caches on upgrade/logout. Test account A → logout → account B with offline and delayed-network conditions.

**F10 — P1 — Image upload memory and file validation are insufficient. Confirmed implementation; exhaustion threshold unmeasured.**

Evidence: `my-medusa-store/src/api/vendor/products/upload-image/route.ts:138` constructs Busboy without application size/count limits; `:200` accumulates chunks and `:206` concatenates them. Vendor proxy `vendor-portal/lib/medusa-proxy.ts:80` also buffers the request. Upload content type follows submitted metadata rather than a demonstrated image-content decoder.

Concurrent large uploads multiply memory across browser→portal→backend and S3 transfer. A web-server/platform body limit may reduce exposure, but that external limit is unverified and is not a substitute for endpoint validation.

Fix: bounded size/count, allowed decoded formats, safe dimensions, streamed or presigned S3 uploads, upload concurrency limits and tenant quotas. Validate before persistence; reject oversized/unsupported content and clean abandoned uploads.

**F11 — P1 — Vendor tokens are not invalidated on logout/password change by the reviewed guards. Confirmed design limitation.**

Evidence: `my-medusa-store/src/api/vendor/auth/logout/route.ts:3` returns 204 without revocation; `_lib/token.ts` issues 24-hour tokens; `_lib/guards.ts:19` verifies claims and vendor approval without checking user token-version/revocation. Password change updates the password hash but not a token version.

Clearing browser storage signs that browser out but does not invalidate a copied bearer token. The `must_reset_password` flag is presented by login/UI, but the reviewed shared guards do not enforce it for protected API operations.

Fix: revocable sessions or token-version checks, shorter access-token lifetime with safe refresh, and backend enforcement of password-reset state. No stolen-token attack against production was attempted.

**F12 — P1 — Vendor password login lacks an application-level throttle in the reviewed path. Confirmed absence in reviewed code; edge protections unknown.**

Evidence: vendor auth login route directly calls `authenticateVendorUser`; that service performs password comparison and updates last-login. The shared middleware has no corresponding vendor-login rate limiter. Customer OTP does have separate throttling logic, so this is not a claim that all authentication is unthrottled.

Fix: shared per-IP/account throttles, progressive backoff, generic errors, and alerting. Confirm any WAF rules rather than assuming they exist.

**F13 — P1 — Production can silently select dummy logistics. Conditional.**

Evidence: `my-medusa-store/src/services/easy-ship/types.ts:91` defaults provider to ITL; `:97` defaults ITL mode to dummy for missing/unrecognized values. The factory then creates `DummyItlProvider`.

Fix: require an explicit provider and live/test mode for production, fail on invalid values, and expose a nonsecret readiness indicator. Verify real label, pickup, tracking, delivery and COD flows in staging. Local values are not evidence of hosted provider mode.

**F14 — P2 — TLS certificate verification is disabled in several data clients. Confirmed configuration.**

Evidence: `src/lib/opensearch.ts:10`, `vendor-portal/lib/debug-controller/db.ts:21`, `src/lib/affiliate-pg.ts:54`, and backend shared DB pool configuration.

Encryption with certificate verification disabled does not authenticate the server properly. Actual network exposure depends on infrastructure.

Fix: trusted certificate chains/managed CA configuration, remove unconditional insecure TLS settings, and reject placeholder OpenSearch credentials in production.

**F15 — P2 — Maintenance/read-only settings are not a complete write-control boundary. Confirmed coverage gap.**

The storefront middleware gates the `/checkout` page; reviewed checkout API handlers do not consult the same settings. Vendor middleware recognizes maintenance but does not enforce `read_only`, and excludes the Medusa proxy from matching. Authorized clients can still call mutation APIs directly unless backend rules independently stop them.

Fix: enforce operational write modes at backend mutation boundaries while preserving payment webhooks and recovery operations that must continue safely. Treat frontend controls as presentation, not authorization.

**F16 — P2 — Scheduled coin expiry is open if its secret is omitted. Conditional.**

Evidence: `src/app/api/cron/expire-coins/route.ts:25` only rejects callers if `CRON_SECRET` exists; GET delegates to the mutating POST handler. Idempotency reduces duplicate financial effects but does not prevent unauthenticated work amplification.

Fix: fail closed in production, authenticate the scheduler, and retain bounded/idempotent processing. Validate scheduled execution and backlog metrics.

**Capacity bottlenecks relevant to 5,000 concurrent users**

**F17 — P1 — Vendor polling repeatedly scans history and executes global earnings writes. Confirmed workload pattern.**

Evidence: `vendor-portal/lib/useVendorLive.ts:25` polls every 10 seconds. Backend `vendor/pulse/route.ts:87` loads vendor-associated order IDs and order graphs; `:152` calls `syncVendorEarningsStatuses`, then `getVendorEarningsSummary` calls it again at `my-medusa-store/src/lib/vendor-earnings.ts:2423`. The sync function at `:1038` runs updates without a vendor filter.

There are useful safeguards: polling is shared among consumers in a tab and pauses while the document is hidden. That reduces duplicate calls within a tab; it does not share results across tabs, browsers, users, or backend instances. The poller also has no visible full-request in-flight gate, so a slow request can overlap the next interval.

At 5,000 visible vendor tabs, the interval alone implies approximately **500 pulse requests/second**, before navigation. Since one pulse invokes global synchronization twice, that implies about 1,000 sync invocations/second at that scenario—not a measured production throughput result. PostgreSQL locking, repeated history hydration, and resource contention are likely constraints.

Fix: move earnings transitions to a scheduled/queued worker, make GET read-only, precompute indexed per-vendor counters, cache snapshots briefly, and add backpressure/jitter. Consider push updates only after the simpler query/counter fixes are measured.

**F18 — P1 — Vendor pagination occurs after broad data retrieval. Confirmed.**

Evidence: `my-medusa-store/src/api/vendor/products/route.ts:45` requests descriptions/images/variants for vendor products before slicing at `:117`. Orders route loads the vendor's order ID set and count graph before slicing a page around `:231`.

This grows with history rather than requested page size. Framework default limits may also make totals incomplete; absence of explicit complete pagination is not proof that every historical record is returned.

Fix: database-level ownership filters, search, limit/offset or keyset pagination; aggregate count queries and separate lightweight list fields from detail hydration. Benchmark large vendors, not only empty/new accounts.

**F19 — P1 — PostgreSQL connection budgets are fragmented. Confirmed pattern; deployed exhaustion not measured.**

The repository has a shared backend pool (`max: 10`) and a guarded storefront helper (`max: 5`), but several customer-affiliate, payout, payment-snapshot and payment helpers still construct pools per request or operation. Multiple pools/serverless instances multiply potential connections; per-request creation also adds TLS and connection-setup latency.

Fix: reuse bounded pools appropriate to each runtime; use PgBouncer or a managed compatible pooler where needed; allocate a total connection budget across API instances, frontend functions, workers, migrations and admin traffic. Add acquisition/query timeouts and measure pool waits. “Max 5 per instance” is not “max 5 for the application.”

**F20 — P2 — Vendor requests add settings fetches and fully buffered proxy responses. Confirmed.**

Evidence: `vendor-portal/middleware.ts:24` fetches its own `/api/site-settings` with `no-store`, without an explicit timeout in that helper; settings caching is process-local with a five-second TTL. `vendor-portal/lib/medusa-proxy.ts:87` has no explicit upstream abort deadline and buffers upstream bodies.

Fix: bounded timeouts, request tracing, separate public-catalog caching from private-data rules, bounded/streamed media handling, and avoid repeated settings network hops where safely possible. Verify multi-instance invalidation semantics.

**Can it handle 5,000 concurrent users?**

**Current answer: unverified, and the reviewed version should not be signed off for that target.** No measured safe maximum can be calculated from source alone. Next.js, PostgreSQL, Redis and Medusa can be components of a scaled system; selecting them does not establish capacity for these custom queries and workflows.

“5,000 concurrent” needs a workload definition:

| Scenario | Illustrative demand, not a benchmark | Implication |
|---|---|---|
| 5,000 shoppers, one navigation per 20 seconds | 250 navigations/sec | CDN hits differ greatly from dynamic misses |
| Same shoppers, four dynamic calls/navigation | About 1,000 dynamic requests/sec | Search/database/cache behavior must be measured |
| 5,000 visible vendor tabs | About 500 pulse calls/sec | Current pulse makes this especially expensive |
| 5,000 simultaneous payment confirmations | A burst of 5,000 writes/recovery workflows | Different test from 5,000 connected browsers |
| Mixed shoppers and vendors | Depends on percentages, think time, history sizes and cache hit rate | Must include realistic hot products and large vendors |

For intuition, if a workload produces 1,000 requests/sec, averages five database operations/request, and each operation occupies a connection for 20 ms, the simple steady-state occupancy is roughly 100 active connection-seconds per second. Real locks, transactions, batching, pooling and variance change that substantially. This is an explanatory calculation, not a sizing recommendation.

Increasing RAM or adding API replicas alone can make database overload worse if each replica adds pools, global updates and duplicated jobs.

**Required capacity test before approval**

1. Use staging that matches the production topology and a dedicated seeded database, with realistic product, order, return, vendor and ledger history. Use payment/logistics sandboxes and synthetic customer data.
2. Record infrastructure: compute limits/replicas, Node versions, PostgreSQL max connections/IOPS/pooling, Redis persistence/eviction/HA, OpenSearch shards/heap, CDN limits/cache ratios, and provider quotas.
3. First measure individual endpoints at low load: home/catalog, search, product detail, cart, login, vendor products/orders, pulse, checkout creation, confirmation, webhook processing and payout reads.
4. Run 100 → 500 → 1,000 → 2,500 → 5,000 active-session ramps with an explicit traffic mix. Use both open arrival-rate tests and closed user journeys so slowdowns do not conceal dropped demand. Confirm the load generators have spare capacity.
5. Include a cold-cache/cold-start run, a warm-cache run, a 5,000-session plateau of at least 30–60 minutes, and a multi-hour soak. Measure vendor polling separately from shopper browsing.
6. Exercise last-unit stock contention, repeated confirmations/webhooks, interrupted uploads, abandoned checkout, partial/multi-vendor returns, COD delivery/RTO and bank receipt retries. Assert no oversell, double capture recording, duplicate reward, duplicate payout receipt or negative wallet beyond explicit policy.
7. Inject backend restarts, worker restarts, database connection interruptions, Redis interruption and third-party timeouts. Verify durable recovery, bounded retries and replay safety.
8. Capture p50/p95/p99 latency, errors, throughput, event-loop lag, CPU/RSS, pool wait/active connections, lock waits/deadlocks, slow queries, Redis/queue lag, unmatched shipping events and payment reconciliation discrepancies.

Suggested initial gates to agree before testing: under 1% unexpected HTTP errors; dynamic browsing API p95 below 1 second; checkout submission/confirmation API p95 below 2 seconds excluding user interaction at the payment provider; no lost or duplicate financial/inventory effects; no steadily growing memory, database wait or queue backlog; normal payment follow-up work within an agreed target such as 60 seconds. These are proposed service objectives, not existing guarantees or universal thresholds. Success also requires acceptable behavior during the tested failure/recovery cases and headroom above the target.

**Deployment and operations gaps**

- The reviewed `.github/workflows/ci.yml` gates root lint/type/build only. It does not run the vendor or backend checks or the 365 selected tests above. A green root pipeline does not certify the whole system.
- Preview deploy invokes `vercel --prebuilt`, but the workflow produces `.next`, not a demonstrated `.vercel/output` from `vercel build`; the artifact list also names `next.config.js` while this repository uses `next.config.ts`. Treat that path as unverified/broken until exercised with real preview credentials.
- The payment worker guide documents a persistent worker and health/dead-job handling. Its historical healthy observation is not evidence that the worker is running now. Confirm current heartbeat, lag, dead jobs, restart behavior and secret alignment on the deployed environment.
- Redis durable modules are configured conditionally on `REDIS_URL`. Production can start without those durable modules if the variable is omitted. Add a production readiness guard and verify Redis persistence/failover before horizontal scaling.
- Checkout snapshot/capture claim helpers contain runtime `CREATE TABLE/INDEX IF NOT EXISTS`. Move required schema changes into controlled migrations to avoid first-request latency and lock contention; verify migrations on a staging clone.
- A restore drill, backup retention/PITR, database/index sizing, WAF/rate limits, alert routing, and error/latency SLO dashboards were not established from the supplied environment. This is “unverified,” not a claim they do not exist.
- Some handlers return database/error details or stack traces, including flash-sale debug routes. The frontend production debug-route guard does not cover every backend debug endpoint or the flash-sale proxy. Remove unnecessary debug routes and use redacted errors.
- Storefront security headers/CSP are explicitly configured; the vendor Next config has no equivalent header configuration. Verify hosted headers and apply an appropriate vendor policy, particularly because its bearer token is stored in browser-accessible storage.

**Useful foundations already present**

- Production Medusa JWT/cookie-secret guards reject several known insecure defaults.
- Vendor product/order paths generally use approval and ownership logic; customer OTP has throttle/audit mechanisms.
- Payment code includes signature and captured-fact verification, exact amount/currency binding, idempotency/claim mechanisms, durable work/outbox concepts and reconciliation tooling.
- Wallet/return/payout regression tests cover important accounting and vendor-scope behavior. The existence of these tests is valuable; they still need isolated database integration and real end-to-end execution.
- Shared pools, query timeouts in the affiliate helper, server-side ownership utilities and per-tab shared polling offer a starting point for consistent hardening.

**Fix order and release gates**

| Order | Work | Evidence required to close |
|---|---|---|
| 1 | Referral authorization; fail-closed debug/webhooks; triage critical reachable dependencies | Unauthorized/cross-tenant tests reject; production secret guards tested; dependency report reviewed |
| 2 | SKU/stock save, sale removal, atomic edits, indexed shipment lookup | Save/reload and injected failure tests; historical shipment event correctly matched |
| 3 | Sensitive service-worker caching, upload limits, token/session controls and login throttles | Two-account offline test; size/content limits; revoked-token and abuse tests |
| 4 | Read-only pulse, indexed database pagination, pool budgets, timeout/backpressure rules | Query plans and before/after endpoint load results with realistic history |
| 5 | Full three-project CI, staging production builds, complete payment/inventory/logistics E2E | Clean CI and staging journeys; no live-money side effects |
| 6 | Production-like 5,000-session load/soak/failure tests and restore drill | Raw results, metrics dashboards, reconciliation and headroom meet agreed gates |

Do not apply speculative hardware sizing or a blanket “ready” label before these gates. A smaller controlled pilot still requires resolving the authentication blockers and confirming payment/shipping operations. This report recommends a sequence; it does not estimate delivery time without testing and upgrade scope.

**Artifacts and reproducibility**

- `docs/PRODUCTION_READINESS_EVIDENCE_2026-10-24.json`: revision, check outcomes, counts, package-advisory details, and scope exclusions.
- `docs/review-evidence/2026-10-24/`: local check logs, full dependency audit JSON, and mock-probe output. No `.env` contents or secret values are included.
- This report reflects the reviewed revision and the advisory database at scan time. Hosted code/configuration and future dependency findings can differ. Findings were not automatically fixed or pushed as part of this review.
