# Shared catalog products and vendor offers

The admin Products table shows catalog SKUs and a Share action. Share creates an opaque link valid for seven days; creating a new link invalidates the previous one. Vendors must sign in and be approved to fetch the draft. The link includes no product contents or credentials. Product details and images load from the backend; the recipient enters their own price and stock. No product is created merely by opening a link.

Set `VENDOR_SITE_URL` on the Medusa backend if the vendor portal uses a different origin. The default is `https://vendor.0weg.in`; for local development use `http://localhost:4000`. Deploy the Medusa backend/admin and vendor portal together. No new database migration is required for this feature.

Medusa requires globally unique variant and inventory SKUs. A vendor offer therefore uses an internal inventory identifier, while `metadata.catalog_skus` maps it to the original catalog SKU. `metadata.catalog_product_id` links the offer to the source product. Existing product records and their inventory identifiers stay intact. Separate Medusa product records preserve the marketplace's existing vendor ownership, fulfillment and accounting behavior. The existing storefront presentation is unchanged.

An existing SKU is accepted only when the brand, product name and variant options match. Name comparison ignores case, punctuation and word order and tolerates one insertion, deletion, substitution or adjacent transposition in one word of at least five characters. Numbers and model tokens must match exactly. Uncertain matches are rejected for admin review rather than silently assigned. A vendor cannot create a second offer for their own existing SKU. A PostgreSQL advisory lock serializes vendor creation/edit checks across processes. Database uniqueness remains in force.

Shared offers start as draft/pending review. Each recipient still needs their own verified brand authorization; another vendor's letter is never copied. If authorization lookup fails, creation fails closed. Vendor requests cannot override ownership, approval or catalog identity metadata. Shared offer identity and variant options cannot be reassigned through the vendor edit endpoints; price and stock remain editable. Changing master catalog data is an admin operation; existing offers are snapshots, not automatically synchronized.

Verification:

- `node --test --require ts-node/register/transpile-only src/lib/__tests__/catalog-identity.test.ts` from `my-medusa-store`.
- `src/scripts/verify-catalog-offers.ts` runs through actual Medusa workflows and refuses any database except loopback PostgreSQL on port 55439. It creates disposable QA vendors/products and does not send mail or charge payments.
- `scripts/verify-vendor-share.cjs` checks the actual vendor middleware with `ts-node` in CommonJS mode.

The dashboard integration follows the existing persistent patch mechanism. `scripts/patch-product-list.cjs` runs during postinstall/predev/prebuild and fails if the installed dashboard's default product table changes. It targets the standard product table used by this deployment; the optional configurable-view table is not extended.
