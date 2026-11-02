# Storefront search, purchase information and read-load improvements

## Scope

Customer search now sends price/brand/rating filters to the search engine before pagination. Index failures are not silently converted into empty results. Unfiltered searches retain a bounded Medusa fallback; multiword titles need not be contiguous. If the index is unavailable, a complete small Medusa result can still be filtered globally. Larger/incomplete result sets return a retryable error instead of filtering only one partial page.

Subcategory tiles use committed 160/240/320px WebP derivatives. Rebuild them after replacing source artwork with `node scripts/build-subcategory-images.cjs`. Source artwork and remote product-image allowlists remain intact.

Product purchase information restores postal-area lookup and shows the shared shipping thresholds and return-policy link before purchase controls. A postal match does **not** prove courier serviceability. No delivery date, product warranty, COD eligibility or free-delivery promise is invented. Provider-backed ETA remains an integration requirement when that data is available.

Campaign titles are shared between home and PDP; untitled legacy campaigns use “Featured deals”. PDP uses the same day/hour/minute/second arithmetic, with compact visible units and full accessible labels. Explicit admin titles are preserved.

## Read traffic and database changes

- Next Data Cache stores public home/category snapshots with 60s revalidation. Same-process concurrent category misses share a promise. Existing category grouping and the >600-product fallback remain intact.
- Cold full-category reads use at most three parallel 60-item requests. This reduces repeated work; it is **not** a replacement for a future indexed canonical-product read model or a distributed admission-control system.
- Public Medusa reads have an aborting 8s upstream timeout.
- Snapshot/payment persistence reuses bounded pools (max four connections per connection configuration, per process), with 5s connection acquisition timeout. Payment SQL, amounts, idempotency keys and workers are unchanged. Schema bootstrap is retained for backwards compatibility but coalesced once per process; failed bootstrap can retry. Removing it entirely requires an independently deployed migration.
- Do not cache cart, address, wallet, payment or customer responses in the public read cache.

## Deployment order

1. Merge reviewed code. No production database migration is required for these changes.
2. On the Medusa VPS, after pulling the merge and before enabling filtered storefront search, run the settings-only task from `my-medusa-store`:
   ```bash
   npx medusa exec ./scripts/configure-search-filters.ts
   ```
   It requires the existing production Meilisearch configuration. It updates filter attributes without deleting/rebuilding the index. Do not run the older destructive full reindex script for this rollout.
3. Build/restart Medusa normally for the default settings change. Deploy the storefront through its normal Vercel production workflow.
4. Check search-engine connectivity/configuration and index freshness. A local mocked search pass cannot certify the live index. Confirm `wireless mouse` finds the known in-stock Frontech mouse; price/brand filters, later pages and true zero results must agree.
5. Check mobile tiles select the derivative image; inspect pincode lookup, seller/variant selection, shipping threshold at ₹998/₹999, cart mutation, sale expiry and confirmation recovery.

No payment or commission worker redeploy is required by this change. No infrastructure settings, live rate changes or production stress test were performed.

## Capacity gate before adding replicas

Measure real browse/search/cart/checkout traffic, DB connection count, p95 latency, cache hit rate and queue age. Use an isolated staging database with production-sized synthetic data. Ramp at 1x/2x/5x the measured peak and soak; test two API instances, shared Redis queue/locks, callback loss and last-unit stock contention. Verify no duplicate orders, charges or ledger receipts. Budget database connections across maximum Vercel concurrency, Medusa and workers before raising instance count.

The committed isolated tests use mocked services and browsers; they establish regressions, not production throughput. Do not run database-writing integration scripts against the shared production database as part of a frontend smoke test.

## Verification on 2 November 2026

- Frontend TypeScript and Medusa TypeScript: pass.
- Production webpack build: pass. The existing sitemap fallback logged an unavailable local backend while generating static pages; this was not a compilation failure.
- Full frontend ESLint: zero errors, 22 pre-existing warnings (the old countdown dependency warning was fixed).
- New readiness suite: 18 passing cases for search retrieval/filtering/outages, bounded pagination, cache coalescing, derivative assets, pool reuse, concurrent snapshot writes/bootstrap retry and postal lookup.
- Mobile 390px and desktop 1280px real React browser fixtures: search error/retry, global filters and counts pass; mobile delivery component and long countdown pass with real CSS modules. Every network boundary in these browser fixtures is mocked.
- Existing cart API (9), cart browser (10), confirmation contract (5), confirmation browser (11), payment request-performance (11), variant selection (5), shipping boundary (3), campaign display (12), category/ranking (6) and browser session/payment regression checks pass.
- Database integration suites could not connect to the configured RDS endpoint (DNS unavailable). They are not counted as passing. No live financial/customer/product data was changed by these checks. A staging DB integration run remains required before claiming end-to-end financial verification.
- Cooler tile: original 307054 bytes; new 160px WebP 7958 bytes and 320px WebP 21582 bytes. This demonstrates image transfer reduction, not a measured production LCP improvement.
- No production stress test or multi-replica failover test was run. No live deployment or Git push was performed in this task.
