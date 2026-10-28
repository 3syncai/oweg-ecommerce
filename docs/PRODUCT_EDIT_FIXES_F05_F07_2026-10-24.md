**Product editing fixes F05–F07 — 24 October 2026**

Implemented locally; not deployed or pushed by this task. Existing security fixes and review artifacts were preserved.

**F05: SKU and stock persist for single products**

The editor sends the default variant's ID, SKU, stock, MRP and sale price in the same PUT request as product details, images and the admin remark. Zero stock is retained; invalid/fractional stock is rejected instead of being converted to zero. A missing stock value is omitted rather than overwriting existing inventory. Existing shared-catalog/ownership checks still run before saving.

Variant SKU and its inventory-item SKU are updated together. Inventory updates account for stock at other locations and reject reductions below reserved stock. Compound/shared inventory requiring separate inventory management is rejected explicitly instead of silently modifying unrelated inventory.

**F06: clearing a sale price removes it**

A blank sale field becomes explicit `discounted_price: null`. Null removes active INR sale-price entries for that variant; an omitted field preserves the existing discount. Clearing the form never falls back to the old sale price. Product-detail and matrix reload queries exclude deleted price entries. Sale/MRP validation also checks an unchanged discount when MRP is reduced.

**F07: one atomic product edit**

Both product PUT and the legacy variant PATCH use the same save implementation. Product details, approval metadata, images/categories, option/variant changes, base/sale prices, inventory and module links share one PostgreSQL transaction. Each Medusa module manager is bound to that transaction using its shared context; there is no fallback to independent commits if transaction-manager support is unavailable. Any failure rolls back the writes and no success response is sent.

The editor advances its saved baselines only after the response confirms the transaction version. Returned variant IDs are retained for subsequent edits, including newly added rows. Backend GET advertises `atomic_edit_version: 1`; the new editor disables saving on an older backend rather than accepting a false success.

Module events are deferred until after commit. Search removal also runs after commit. Those external effects cannot join PostgreSQL's transaction: delivery/indexing failures are logged and do not turn a committed edit into a false failed-save response. Existing search/event operational monitoring and reconciliation remain necessary. A legacy matrix-response read failure returns the saved product with a null matrix rather than reporting that the committed write failed.

**Validation performed**

- 14 transaction regression tests passed using a disposable PostgreSQL server on localhost port 55439. They cover persisted SKU/stock, explicit sale removal, preserved omitted discounts, variant creation, invalid pricing, cross-vendor/foreign-variant rejection, reservations, and rollback after injected stock or product failures.
- Tests use real PostgreSQL commits/rollbacks with module boundaries mocked. A separate check uses a real MikroORM manager to verify that its writes share the Knex transaction and roll back together. This is not a full deployed Medusa end-to-end test.
- All 122 vendor tests passed, including 9 new product-edit payload/flow regressions.
- All 105 existing backend unit tests passed; the 45 security regression tests also passed.
- Vendor and backend TypeScript checks passed. ESLint passed for the new serializer, payload tests, API contracts and database-test script. Existing unrelated vendor-page lint debt remains outside this patch.
- No production database, payment, inventory or shipment records were accessed or changed for these tests.

**Rollout**

Deploy the backend first, then the vendor portal, and reload the product editor. Older backends do not advertise the required capability, so the updated editor shows a deployment message and prevents saving. No new application schema migration is required. The transaction bridge targets the installed Medusa 2.11 APIs; rerun the transaction tests when upgrading the framework.

In staging, change only SKU, only stock, only the sale field, and details plus variants; save and reload each case. Test variant addition and an induced inventory failure, checking that the latter leaves the original product and approval state intact. Shared catalog identities, reserved inventory, and third-party events/search should also be verified against staging's real module wiring.

To rerun the database tests, install backend dependencies and point `PRODUCT_EDIT_TEST_DATABASE_URL` at a disposable database on `127.0.0.1:55439/postgres`, then run `npm run test:product-edit` from `my-medusa-store`. The script rejects other hosts, ports and database names, creates isolated QA schemas, and drops them afterwards. Without the explicit test URL, database cases are skipped. Do not point it at an application database.
