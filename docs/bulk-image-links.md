# Bulk image links

Image columns accept local filenames, embedded pictures and public HTTP/HTTPS URLs.
Video links retain their existing HTTPS-only policy.

Remote references are checked automatically after parsing, with three concurrent
requests and deduplication across rows. URLs preserve path/query case; local
filenames continue to match case-insensitively. Checking/failed references block
submission until ready. Failed links show an error on their product row and can
be retried without rechecking successful references.

`POST /vendor/products/import-image-url` requires an approved vendor. HTTP input
tries HTTPS first. A working HTTPS image stays external; HTTP-only images are
copied to vendor-scoped S3 storage and returned as HTTPS. Content hashes avoid
duplicate storage objects on retry. Existing HTTPS input never downgrades to HTTP.

Downloads validate and pin public DNS addresses, recheck every redirect, reject
internal/private destinations, credentials and nonstandard ports, enforce a
15-second download deadline and 10 MB streaming limit, and verify raster image
signatures. SVG/HTML responses are rejected. The endpoint allows eight active
imports per process; the client retries temporary busy responses.

Deploy both the Medusa backend and vendor portal. No database migration is needed.
Existing parsed uploads must be started again to seed the new image-check states.
The source Excel does not need to be edited.

Regression tests: `my-medusa-store/scripts/remote-product-image.test.cjs` and
`vendor-portal/tests/bulk-image-import.test.mjs`, alongside existing bulk/API tests.
