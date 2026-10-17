import { test } from "node:test"
import assert from "node:assert/strict"
import { cleanVendorMetadata, prepareCatalogOffer, protectCatalogEdit, sameCatalogName, selectCatalogMatch, vendorInventorySku } from "../catalog-identity"
import { issueProductShare, sharedProductDraft, validProductShare } from "../product-share"
import { canAccessAdminApi } from "../admin-access/policy"
import type { AdminAccess } from "../../shared/admin-access"

const source: any = { id: "product_source", title: "Bajaj Electric Kettle 1.5L 1500W", metadata: { brand: "Bajaj", vendor_id: "vendor_a", bank_account: "private" }, images: [{ url: "https://images.example/kettle.jpg" }], variants: [{ id: "variant_a", sku: "BAJ-123", options: [], prices: [{ amount: 50 }], inventory_quantity: 19 }] }
const scope = (products: any[]) => ({ resolve: () => ({ graph: async () => ({ data: products }) }) })

test("same name supports case, punctuation, word order and one spelling typo", () => {
  for (const name of ["BAJAJ electric kettle 1.5L 1500W", "Electric Bajaj Kettle 1.5L 1500W", "Bajaj Electric Kettlr 1.5L 1500W", "Bajaj Electric Kettel 1.5L 1500W"])
    assert.equal(sameCatalogName(source.title, name), true)
})
test("different capacity, wattage, model, item and missing words are not typo matches", () => {
  for (const name of ["Bajaj Electric Kettle 1.8L 1500W", "Bajaj Electric Kettle 1.5L 1800W", "Bajaj Electric Toaster 1.5L 1500W", "Electric Kettle 1.5L 1500W", "Bajaj Electric Kettle 1.5L 1500W Pro"])
    assert.equal(sameCatalogName(source.title, name), false)
  assert.equal(sameCatalogName("Samsung AB123 refrigerator", "Samsung AB124 refrigerator"), false)
})
test("same SKU different product or brand rejects; same vendor duplicate rejects", () => {
  assert.throws(() => selectCatalogMatch([source], "Toaster", "Bajaj", "baj-123", "vendor_b"))
  assert.throws(() => selectCatalogMatch([source], source.title, "Other", "BAJ-123", "vendor_b"))
  assert.throws(() => selectCatalogMatch([source], source.title, "Bajaj", "BAJ-123", "vendor_a"))
})
test("another vendor receives catalog link and independent deterministic inventory SKU", async () => {
  const result = await prepareCatalogOffer(scope([source]), "vendor_b", { title: source.title, metadata: { brand: "Bajaj" }, variants: [{ sku: "baj-123", prices: [{ amount: 125 }], inventory_quantity: 7 }] })
  assert.equal(result.metadata.catalog_product_id, source.id)
  assert.equal(result.metadata.catalog_skus[result.variants[0].sku], "BAJ-123")
  assert.notEqual(result.variants[0].sku, source.variants[0].sku)
  assert.notEqual(vendorInventorySku("vendor_b", "BAJ-123"), vendorInventorySku("vendor_c", "BAJ-123"))
  assert.deepEqual(result.variants[0].prices, [{ amount: 125 }])
  assert.equal(result.variants[0].inventory_quantity, 7)
  assert.equal(source.variants[0].inventory_quantity, 19)
})
test("duplicate form SKUs and different variant choices are rejected", async () => {
  await assert.rejects(prepareCatalogOffer(scope([]), "b", { title: "Test", variants: [{ sku: "a" }, { sku: "A" }] }))
  await assert.rejects(prepareCatalogOffer(scope([source]), "b", { title: source.title, metadata: { brand: "Bajaj" }, variants: [{ sku: "BAJ-123", options: { Color: "Red" } }] }))
})
test("multiple catalog variants keep their own options and public SKUs", async () => {
  const product = { ...source, variants: [
    { id: "red", sku: "BAJ-RED", options: [{ option: { title: "Color" }, value: "Red" }] },
    { id: "blue", sku: "BAJ-BLUE", options: [{ option: { title: "Color" }, value: "Blue" }] },
  ] }
  const result = await prepareCatalogOffer(scope([product]), "b", { title: source.title, metadata: { brand: "Bajaj" }, variants: [
    { sku: "BAJ-RED", options: { Color: "Red" } }, { sku: "BAJ-BLUE", options: { Color: "Blue" } },
  ] })
  assert.equal(result.metadata.catalog_product_id, source.id)
  assert.deepEqual(Object.values(result.metadata.catalog_skus).sort(), ["BAJ-BLUE", "BAJ-RED"])
  await assert.rejects(prepareCatalogOffer(scope([product]), "b", { title: source.title, metadata: { brand: "Bajaj" }, variants: [{ sku: "BAJ-RED" }] }))
})
test("offer edit preserves inventory identifier and prevents identity reassignment", async () => {
  const internal = vendorInventorySku("b", "BAJ-123")
  const offer = { ...source, id: "offer_b", metadata: { brand: "Bajaj", vendor_id: "b", catalog_product_id: source.id, catalog_skus: { [internal]: "BAJ-123" } }, variants: [{ id: "variant_b", sku: internal, options: [] }] }
  const body = { variants: [{ id: "variant_b", sku: "BAJ-123", price: 10 }] }
  await protectCatalogEdit(scope([source, offer]), offer, body)
  assert.equal(body.variants[0].sku, internal)
  await assert.rejects(protectCatalogEdit(scope([source, offer]), offer, { title: "Different product" }))
  await assert.rejects(protectCatalogEdit(scope([source, offer]), source, { title: "Different product" }))
})
test("share tokens expire, reject tampering and drafts expose only catalog data", () => {
  const share = issueProductShare()
  const p = { ...source, metadata: { ...source.metadata, catalog_share_hash: share.hash, catalog_share_expires: share.expires } }
  assert.equal(validProductShare(p, share.token), true)
  assert.equal(validProductShare(p, share.token + "x"), false)
  assert.equal(validProductShare({ ...p, metadata: { ...p.metadata, catalog_share_expires: "2000-01-01" } }, share.token), false)
  const draft = sharedProductDraft(p)
  assert.deepEqual(draft.images, source.images)
  assert.equal(draft.variants[0].sku, "BAJ-123")
  for (const secret of ["bank_account", "prices", "inventory_quantity", "vendor_id", "catalog_share_hash"])
    assert.equal(JSON.stringify(draft).includes(secret), false)
})
test("vendor metadata cannot override owner, review state or catalog identity", () => {
  assert.deepEqual(cleanVendorMetadata({ vendor_id: "another", approval_status: "approved", approved_by: "admin", catalog_product_id: "fake", catalog_skus: {}, brand: "Bajaj" }), { brand: "Bajaj" })
})

test("only admins with product write permission can issue share links", () => {
  const access: AdminAccess = { user_id: "sub", kind: "subadmin", active: true, role_id: "r", role_name: "Catalog", responsibilities: "", permissions: ["catalog.products"] }
  assert.equal(canAccessAdminApi(access, "POST", "/admin/products/p1/share"), true)
  assert.equal(canAccessAdminApi({ ...access, permissions: ["customers.groups"] }, "POST", "/admin/products/p1/share"), false)
  assert.equal(canAccessAdminApi({ ...access, must_change_password: true }, "POST", "/admin/products/p1/share"), false)
})
