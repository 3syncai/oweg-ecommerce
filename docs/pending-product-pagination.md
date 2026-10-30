# Pending-product approval pagination

The approval widget previously fetched every product with metadata, description and relations, filtered pending records in JavaScript, and loaded every vendor. It then rendered every pending record above the native Products list.

The pending endpoint now accepts integer `limit` (default 25, maximum 100) and `offset` (default 0). SQL filters `deleted_at IS NULL` and the original `metadata.approval_status = pending` rule before selecting a page of IDs. Pages use deterministic `created_at DESC, id DESC` ordering. Only the selected IDs are expanded through Medusa's product graph, and only their unique vendor IDs are fetched. The response includes `products`, `count`, `limit`, and `offset`. Existing catalog RBAC remains in place and responses are not cached.

The widget displays 25 rows, total count, Previous/Next navigation, refresh and retry controls. Review/back preserves the current page. Successful approval/rejection reloads the page and count; removing the last item clamps to the previous available page. Concurrent page requests cannot overwrite newer results. Invalid parameters return 400; failed loads are not shown as a successfully empty queue. List thumbnails load lazily. Approval, rejection, category creation, brand review and catalog-variant approval business rules are unchanged.

## Read-only verification

Against the current configured data there were 963 pending records. The old deployed endpoint returned all 963, approximately 2,785,278 raw JSON bytes, even when asked for limit=25. The new local endpoint returned:

- Offset 0: 25 records, count 963, 80,476 bytes.
- Offset 25: 25 records, count 963, 71,790 bytes.
- Offset 950: 13 records, count 963, 22,263 bytes.

The first-page payload was about 97.1% smaller. This is a response-size comparison; local and production request durations are not a controlled latency benchmark.

Local browser login, page 1, page 2, Previous navigation and review/back were verified without approving, rejecting, editing or publishing any product. Automated tests cover bounds, malformed input, a 1,001-record queue, distinct pages, deterministic hydration order, vendor scoping, empty/out-of-range pages, concurrent status changes and last-item page adjustment. Approval/rejection themselves were not executed against real products.

The deployed admin browser still displayed the new readable connection failure during sign-in. Separate deployed-origin API probes timed out for catalog/customer login and for superadmin access after successful login/session creation. Pagination reduces product-review load but does not establish that the intermittent Vercel-to-origin connection issue is resolved.

## Rollout

Deploy both Medusa backend and admin frontend from this revision. Rebuild/restart the backend, then deploy the admin bundle. No schema migration, credential reset or payment-worker restart is needed. The new widget explicitly reports a backend-version mismatch if it receives the old unpaginated response.
