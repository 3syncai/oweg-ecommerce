# Bulk listing shipping quote lifecycle

Large files must not require every product's shipping quote to be fresh at the same instant. The existing 15-minute quote lifetime and price calculator are unchanged.

## Preview

- Calculate missing or changed package quotes with at most three concurrent requests. Reuse fresh decisions and share identical requests within a run.
- The refresh button targets missing, failed, expired or nearly expired quotes. It does not clear existing listing prices or refresh valid quotes.
- Expiration updates the display, not the saved in-memory pricing decision. Manual listing-price edits survive refresh and page navigation.
- Abort outdated preview requests on input changes, submission or unmount. Each API estimate request has a 90-second timeout.
- If refreshing changes rounded freight or the suggested listing price, mark the decision as requiring explicit price review. Preserve custom prices; update automatic suggestions. Acknowledge with “Confirm reviewed price.”

## Submission

- Row validation, image readiness, brand authorization, package signatures and positive listing-price validation continue to apply.
- An expired but otherwise valid decision may enter the guarded submission workflow. This is not permission to build a stale product payload.
- Immediately before each product request, refresh that product's expired/nearly expired variant quotes, leaving a one-minute freshness margin for fresh responses. Recheck actual expiry before payload creation.
- A changed shipping charge pauses the workflow before creating the affected product and opens its review page. Resume after review; already successful product rows are skipped.
- A courier error, unusable response, or still-expired quote fails that product without creating a payload. Existing retry behavior remains available for failed products.
- `buildBulkPayload` and `resolveBulkListing` remain strict by default: stale or unreviewed pricing is rejected. Quote expiry was not removed or extended.

## Validation

`vendor-portal/tests/bulk-logistics.test.mjs` covers selective reuse, identical-package deduplication, bounded concurrency, cancellation, edits made during refresh, automatic and manual price-review gates, unavailable/expired responses, strict payload guards and a simulated 999-product submission that runs much longer than the quote lifetime.

Live preview checks do not publish products. Real courier outages can still require retry or a manual quote; this change does not guarantee every delivery route is available.

Deployment: rebuild/deploy the vendor portal. No database migration or backend TTL change is needed for this lifecycle change.
