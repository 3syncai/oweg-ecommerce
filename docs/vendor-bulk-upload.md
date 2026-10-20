# Vendor bulk product upload

The vendor portal uses the existing vendor product creation endpoint for each
product group. Imports create drafts for admin review; they do not publish directly.
The backend continues to enforce vendor ownership, brand authorization and shared
catalog SKU rules.

## Template v4

Download the template from `/products/bulk-upload`. Fill `Products` only. Examples,
Instructions, Field Guide, GST Codes, Categories and Brands are reference sheets.
Mandatory headers use coral, optional headers use dark green, and calculated or
fixed headers use muted green. Title, Description, Brand, Category, Subcategory,
package Length/Width/Height (cm), Weight (kg), HSN Code, Country of Origin, Tax Code,
MRP INR, Selling Price INR, Inventory Count and Image 1–3 are mandatory.

- Subtitle and Handle are explicitly optional. Brand also supplies the collection;
  unknown brands become collection requests for admin review. Additional categories,
  separate collection selection, MID, shipping profile and Brand Letter columns are removed.
- HSN Code replaces HS Code. Origin defaults to IN; the tax country is India.
- Tax Code has a native Excel dropdown. GST Rate and Discount % are calculated,
  protected cells. The importer independently derives these values and never trusts
  cached formula results. Input formulas are rejected. Tax code is mandatory even if
  a GST rate is supplied. Inconsistent manually supplied GST is rejected.
- MRP INR and Selling Price INR are product base prices, positive with up to two
  decimals. Selling price cannot exceed base MRP. Equal values mean no base discount.
  The former Discounted Price INR header is still accepted for older workbooks.
- Managed Inventory and Allow Backorder are protected Yes values. The importer
  rejects attempts to turn either off. Stock is a required non-negative whole number;
  zero is valid. Default shipping profile and sales channel are assigned by the backend.
- Each Option N Name/Value pair is followed by Option N Images. Comma-separated
  Size `8,9,10` and Color `Red,Green,Blue` generate nine variants. The row's stock and
  prices apply to EACH variant. Use separate rows with individual values for distinct
  stock or prices. Maximum 100 variants/product and 10,000 generated variants/file.
- Option images are comma-separated filenames/HTTPS URLs in the same order as the
  option values, or one shared image. `Red,Blue` pairs with `red.jpg,blue.jpg`.
  Color, or the first option with images, supplies the existing visual gallery.
  All option images are included in the main gallery and retained in `option_images` metadata.
- Thumbnail and Image 1..5 are together, followed by Video URLs. More numbered
  image and option columns are supported. Embedded option pictures apply to every
  value of that option on the source row; use filenames for distinct pictures per value.
- Blank SKU or `(auto)` generates a unique SKU. A supplied SKU on an expanded row
  gets numbered suffixes (`SHOE-1`, `SHOE-2`...). Duplicate SKUs and combinations block import.
- After parsing, upload authorization once per brand: one PDF/PNG/JPG, or select
  multiple PNG/JPG images to automatically combine into a PDF. Limit 20 images,
  10 MB each, 30 MB combined input; final upload must be at most 10 MB. Pending
  authorization allows draft submission; publication still requires admin approval.

## Validation and submission

After parsing, each variant receives a logistics estimate using its package
attributes and the existing vendor shipping endpoint. The preview adds the existing
product calculator's fee/tax lines to the Excel base selling price (or base MRP for
legacy files without a selling price). This is a cost build-up, not a reverse
calculation guaranteeing a settlement amount. The resulting listing price is
prefilled and editable. View calculation shows that variant's package, route,
base price, fee/tax breakdown and selected listing price. Refreshing logistics
preserves a manual override when the source attributes have not changed.

Submission is blocked while a quote is pending/failed, a listing price is invalid,
or its source price/tax/package attributes have changed. No silent frontend freight
fallback is used. Backend weight-based estimates are identified in the preview;
actual shipment charges can vary. Listing prices must be positive with at most two
decimals. Source Excel prices stay unchanged in the preview and are saved in each
variant's `bulk_base_pricing` metadata alongside the quote and listing decision.
Catalogue MRP is calculated from the base MRP with the same charges and is at least
the selected listing price; the selected listing becomes the catalogue selling price.

Older templates retain their original parser requirements, but imports through the
current portal must still complete package logistics and listing-price review.

Maximum 1,000 source rows, 200 columns and 10 MB per workbook. XLSX/XLS/CSV are
supported; dropdowns/formulas/protection are provided in the downloaded XLSX.
Headers belong on row one; duplicate/unknown headers and merged cells are rejected.
Legacy Price INR and HS Code are accepted as aliases, but stock is now required.
Removed template fields are rejected by the workbook reader so data is not silently lost.

Same Handle (or Title when Handle is blank) groups variants into a product.
Product-level details must match across rows. Every row must pass validation before
submission. Referenced images must be uploaded or provided as HTTPS URLs. Uploads
run in batches of four. Products are submitted as drafts through the existing vendor
endpoint; ownership, brand authorization and shared-SKU rules remain enforced.
Product-level preview edits apply to every variant together. Successful products are skipped on retry; after a lost connection check Products
before retrying. Reference categories/brands are fully paginated before import.

## Verification

From `vendor-portal`:

```sh
npm run test:bulk
npx tsc --noEmit --incremental false
npx eslint app/products/bulk-upload/page.tsx components/bulk-upload/BulkPricingReview.tsx lib/bulk-pricing.ts lib/bulk-upload.ts lib/bulk-workbook.ts lib/bulk-payload.ts tests/bulk-upload.test.mjs
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

## v3 verification (isolated local database)

The v3 browser test signed in as the requested Vishal vendor on port 4001,
connected to a separate Medusa backend on 9002 and PostgreSQL on 55439.
It did not insert fixtures into the cleaned AWS catalogue or access `oweg_backup`.
The template was downloaded through the UI and its saved OOXML was parsed.
Native desktop Excel interaction/recalculation was not exercised.

A missing-stock workbook was rejected with submission disabled. A valid workbook
created two pending drafts/four variants: three shoe sizes (5 units each, MRP
2999 / selling 2399) and a simple mug (0 units, MRP 499, no sale price).
Read-back checks verified GST 5/18 from codes, HSN `006402`, India origin/tax,
brand-based collection requests, fixed inventory/backorder flags and default shipping.
Both real Unsplash photos returned HTTP 200 and rendered at their natural width
in the vendor product list. One authorization saved as PNG; two clearly marked
local test images were combined into a valid PDF and uploaded successfully.
No product was approved or published. The automated contract suite now has 63 tests.

The isolated run also reproduced the pre-existing `product.created` subscriber
error resolving `productService`; that separate search-indexing problem is not
fixed by the bulk template changes. The vendor creation requests themselves
completed successfully and the draft data was verified.

## Authorized real-database demonstration

After explicit user authorization, the visible portal on port 4000 was used with
Vishal's real vendor account and the backend connected to AWS `oweg_db`.
The downloaded template was filled with Bajaj KTX 1.5L DLX and 1.8L DLX kettles,
using official Bajaj product names, prices (2050/2150), and four official photos.
Stock quantities 5/0 were test inputs, and descriptions identify the listings as
bulk-upload demonstration drafts. Both resolved to Home Appliances > Kettles
and the existing Bajaj collection.

Because that vendor had no brand authorization, the uploaded PNG was explicitly
marked SAMPLE / TESTING ONLY / NOT VALID BRAND AUTHORIZATION. It contains no
brand-issued signature or endorsement and remains unverified. It must be replaced
with genuine authorization before either product can be approved for publication.
The UI created both products successfully as pending drafts. Read-only checks
verified ownership, prices, inventory, GST code/rate, category, collection,
option-image metadata, and fixed inventory/backorder flags. All four saved gallery
URLs returned HTTP 200, and both thumbnails rendered in the real vendor catalog.
No product was published, and `oweg_backup` was not accessed or changed.

Official sources:
- https://www.bajajelectricals.com/products/ktx-1-5-l-dlx
- https://www.bajajelectricals.com/products/ktx-1-8-l-dlx

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
