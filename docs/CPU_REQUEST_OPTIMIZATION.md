# CPU and request optimization — first pass

These fixes target demonstrated unnecessary work in the repository. They do not establish which routes caused the October hosting quota incident. No live Vercel function-level CPU export was available during this review.

## Storefront

- Stop the flash-sale countdown from requesting the API every second after expiry. The expiry causes one refresh; the existing minute poll handles subsequent retries.
- Pause flash-sale and public site-settings network polling while a tab is hidden. Refresh on return to the tab; prevent overlapping calls.
- Replace the flash-sale route's 30-minute raw cache with a 30-second cache and one shared in-flight load per warm instance. Normalize expired sales to inactive.
- Allow the CDN to reuse only this public catalog response for at most 15 seconds, bounded by the known sale expiry. Backend errors remain `no-store`; no customer credentials are forwarded. Existing home-page stock filtering remains applied.

## Vendor portal

- Stop and detach the shared pulse poller when its last consumer unmounts. Concurrent timer/focus/mutation triggers share one request; local invalidation callbacks are preserved. Discard responses if the vendor token changed in flight.
- Pause public settings polling in hidden tabs without changing the foreground poll interval.
- Read the existing cached middleware settings directly using the supported Node.js middleware runtime. Remove the self-HTTP call to `/api/site-settings` on each page request; preserve maintenance, registration and authentication gates.
- Stream backend responses instead of buffering/copying the complete body. All private vendor responses remain `no-store`; authentication and backend routing remain unchanged.

## Verification and limits

`scripts/cpu-request-regressions.test.cjs` exercises cache bursts, expiry, hidden-tab traffic, failures/retries, stock filtering, vendor poller lifecycle, account switching, maintenance/login gates and streamed private responses. A burst of 50 simultaneous flash-sale cache misses produces one mocked upstream request. These are deterministic request-count checks, not production CPU benchmarks.

Preserve checkout/order/payment freshness. No shared caching was added to private orders, inventory, payments, wallets, sessions or customer data. No changes were made to commission rates or listing-price calculations.

The storefront already has short-lived home-feed/discovery caches and a product-detail revalidation policy. Larger changes to SSR, catalog cache lifetimes or navigation prefetch should be based on live route measurements rather than applied blindly.

After deployment, compare equivalent traffic windows in Vercel for each project: Active CPU, invocations, CPU per invocation, top paths, cache hit rate, error rate and p95 response time. Separate production from previews and account for bots and traffic growth. Actual cost/CPU savings are not yet measured.

Deploy both the storefront and vendor portal. The vendor middleware runtime change was checked with an isolated production build. No backend/database migration is needed for this pass.
