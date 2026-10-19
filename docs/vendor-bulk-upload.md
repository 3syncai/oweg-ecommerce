# Vendor bulk product upload

The vendor portal uses the existing vendor product creation endpoint for each
product group. Imports create drafts for admin review; they do not publish directly.
The backend continues to enforce vendor ownership, brand authorization and shared
catalog SKU rules.

## Template v2

Download the current template from `/products/bulk-upload`. Fill the blank
`Products` sheet. `Examples`, `Instructions`, `Field Guide`, `GST Codes`,
`Categories`, and `Collections` are reference sheets and are never imported.

The template adds tax code / derived GST rate, shipping profile ID, public video
URLs, additional category IDs, and a third option pair. More numbered option pairs
and Image columns can be added. Existing filename-based and embedded Excel image
flows remain supported. Legacy templates must include the required Tax Code column
before import; downloading v2 is recommended.

Price INR means MRP; Discounted Price INR is the optional selling price. Prices
use rupees with at most two decimal places. Stock is a non-negative whole number.
Dimensions use cm and weight uses kg, matching the single-product form. HSN/HS,
MID and SKU identifiers should be entered as text to preserve leading zeros.

Local videos can be added in the individual product editor. Bulk video entries
currently accept existing public HTTPS video URLs.

## Validation and submission

- Maximum 1,000 data rows, 200 columns and 10 MB per workbook; up to 100 variants
  per product. XLSX, XLS and CSV are supported.
- Headers belong in row one. Duplicate or unknown headers, merged cells, formulas,
  malformed numbers, invalid booleans, invalid tax codes and inconsistent GST rates
  produce actionable errors. Formula results must be pasted as values.
- Rows with the same Handle form one product. When Handle is blank, Title is the
  grouping key. Use separate handles for different products sharing a title.
- Product-level details must agree across all variant rows. Option combinations
  and SKUs must be unique; SKU comparisons are case-insensitive.
- All row validation errors must be fixed before submission. Referenced thumbnail,
  gallery and visual-option images must be uploaded or supplied as HTTPS URLs.
  Uploads run in batches of four to avoid flooding the image endpoint.
- A vendor must have an uploaded letter for each brand. A pending letter permits
  draft submission; admin verification is still required for publication.
- Existing catalog SKUs are passed through to the backend for shared-product
  checks. An existing SKU owned by the same vendor is rejected rather than
  creating a second offer for that vendor.
- Each product group is submitted in one request, so invalid variant rows cannot
  become partial products. A failure in one product does not erase successful
  products. Review failed products to retry only those products.
- Rapid duplicate submit clicks are blocked. If the connection is lost after a
  request, check the Products list before retrying. Existing vendor SKU checks
  prevent duplicating an already-created offer.

Categories and collections load all pages before a template can be downloaded or
parsed. Unknown category/collection names become admin review requests; additional
category IDs must refer to existing categories. Shipping profile defaults and sales
channel assignment follow the existing product creation endpoint.

## Verification

From `vendor-portal`:

```sh
npm run test:bulk
npx tsc --noEmit --incremental false
npx eslint app/products/bulk-upload/page.tsx lib/bulk-upload.ts lib/bulk-workbook.ts lib/bulk-payload.ts tests/bulk-upload.test.mjs
```

The automated suite uses the production template generator, workbook reader,
parser, product grouping, brand readiness and payload builder. It covers XLSX/XLS/CSV,
validation failures, identifiers, multiple options, media, tax, product requests,
limits and paginated reference data.

End-to-end testing on the authorized TEST vendor created one simple dummy draft
and one dummy draft with Size, Color and Fit options. Saved prices, inventory,
GST, physical attributes, HSN/MID text, thumbnail and color galleries were read
back from the vendor API. A mixed batch intentionally retried the existing vendor
SKU: the duplicate was rejected while both variants of the new product succeeded.
The retry UI offered only the failed product. A later visible demo on the same
vendor account imported two more clearly labeled products (three variants),
verified the saved fields and confirmed with an API recount that a repeated vendor
SKU returned HTTP 409 without creating a duplicate. Invalid price/stock and missing
brand-letter cases were demonstrated in the browser as well.

The clearly labeled `BULK QA 20261019`, `OWEG DEMO` and subsequent Nike demo
products were created as drafts pending approval. No test product was approved
or published. These fixtures were subsequently removed during the separately
approved fresh-start data cleanup; the checks above describe the test results
before that cleanup.

## Issues found during the visible demo

The image/video upload routes used `S3_FILE_URL` directly even when it pointed to
an old bucket. Uploads succeeded in the current bucket, but returned image URLs
gave HTTP 403 `AllAccessDisabled` from the old bucket. Both routes now reuse
`s3PublicBaseUrl` with their resolved upload bucket and region. The demo images
were re-uploaded and verified to return HTTP 200; only the two demo drafts' media
links were repaired. Previously stored URLs on other products are not migrated.
The vendor product update route now accepts an explicit thumbnail URL, so image
corrections can be saved through the vendor API.

The catalog used desktop columns at tablet widths, leaving almost no room for
product names beside the sidebar. It now uses cards until the larger desktop
breakpoint, keeping names, GST and status readable.

Run the S3 regression tests from `my-medusa-store`:

```sh
node --test --require ts-node/register/transpile-only src/lib/__tests__/s3-upload-url.test.ts
```

Deploy both the vendor portal and Medusa backend for the upload URL fix. No schema
migration is needed. The local demo files and verification results are available
in the workspace's `bulk-upload-demo` folder; credentials are not included there.

The local backend also logged an unresolved OpenSearch hostname and an unrelated
scheduled order job using the unsupported `cancelled` enum value. Those are not
covered by the bulk-upload checks and still need separate investigation; this
demo does not claim that publication/search indexing or the order scheduler is
healthy.
