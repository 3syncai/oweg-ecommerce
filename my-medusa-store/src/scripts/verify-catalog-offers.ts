import assert from "node:assert/strict"
import { POST as createOffer } from "../api/vendor/products/route"
import { POST as shareProduct } from "../api/admin/products/[id]/share/route"
import { GET as fetchShared } from "../api/vendor/catalog/[id]/route"
import { signVendorToken } from "../api/vendor/_lib/token"
import { loadShareProduct } from "../lib/product-share"
import { PATCH as updateOffer } from "../api/vendor/products/[id]/variants/route"

/** Run with medusa exec; deliberately refuses the configured/shared database. */
export default async function verify({ container }: { container: any }) {
  const dbUrl = new URL(process.env.DATABASE_URL || "")
  assert.equal(dbUrl.hostname, "127.0.0.1")
  assert.equal(dbUrl.port, "55439")
  const vendors = container.resolve("vendor")
  const brandAuth = container.resolve("vendorBrandAuthorization")
  const prefix = `catalog-qa-${Date.now()}`
  const brand = "Catalog QA"
  const profiles = container.resolve("fulfillment")
  if (!(await profiles.listShippingProfiles({ type: "default" })).length)
    await profiles.createShippingProfiles({ name: "QA default", type: "default" })
  const locations = container.resolve("stock_location")
  if (!(await locations.listStockLocations({ name: "Default Warehouse" })).length)
    await locations.createStockLocations({ name: "Default Warehouse" })
  const vendorA = await vendors.createVendors({ name: "Catalog QA A", email: `${prefix}-a@example.invalid`, is_approved: true })
  const vendorB = await vendors.createVendors({ name: "Catalog QA B", email: `${prefix}-b@example.invalid`, is_approved: true })
  const vendorC = await vendors.createVendors({ name: "Catalog QA C", email: `${prefix}-c@example.invalid`, is_approved: true })
  for (const vendor of [vendorA, vendorB])
    await brandAuth.createVendorBrandAuthorizations({ vendor_id: vendor.id, brand_name: brand.toLowerCase(), authorization_file_url: "https://example.invalid/qa-letter.pdf", authorization_file_key: "qa-letter", verified: true })

  const invoke = async (handler: any, vendor: any, body: any = {}, params: any = {}, query: any = {}) => {
    let status = 200, result: any
    const res: any = { setHeader() {}, status(code: number) { status = code; return res }, json(data: any) { result = data; return res }, end() { return res } }
    const req: any = { scope: container, body, params, query, headers: vendor ? { authorization: `Bearer ${signVendorToken({ sub: "qa-user", vendor_id: vendor.id, scope: "vendor" })}` } : {} }
    await handler(req, res)
    return { status, result }
  }
  const sku = prefix.toUpperCase()
  const payload = (price: number, stock: number) => ({ title: "Catalog Electric Kettle 1.5L 1500W", metadata: { brand }, images: [{ url: "https://example.invalid/kettle.jpg" }], variants: [{ title: "Default variant", sku, manage_inventory: true, allow_backorder: false, prices: [{ amount: price, currency_code: "inr" }], inventory_quantity: stock }] })
  const first = await invoke(createOffer, vendorA, payload(1000, 9))
  assert.equal(first.status, 200, JSON.stringify(first.result))
  const original = first.result.product
  const shared = await invoke(shareProduct, null, {}, { id: original.id })
  assert.equal(shared.status, 200)
  const link = new URL(shared.result.url)
  const token = link.searchParams.get("share")
  assert.equal((await invoke(fetchShared, null, {}, { id: original.id }, { share: token })).status, 401)
  assert.equal((await invoke(fetchShared, vendorB, {}, { id: original.id }, { share: "tampered" })).status, 404)
  const prefill = await invoke(fetchShared, vendorB, {}, { id: original.id }, { share: token })
  assert.equal(prefill.status, 200)
  assert.equal(prefill.result.product.images[0].url, "https://example.invalid/kettle.jpg")
  assert.equal(prefill.result.product.variants[0].prices, undefined)
  assert.equal(prefill.result.product.variants[0].inventory_quantity, undefined)
  const secondPayload = { ...payload(1200, 4), shared_product_id: original.id, share_token: token }
  const second = await invoke(createOffer, vendorB, secondPayload)
  assert.equal(second.status, 200, JSON.stringify(second.result))
  assert.equal(second.result.product.metadata.catalog_product_id, original.id)
  assert.notEqual(second.result.product.variants[0].sku, original.variants[0].sku)
  assert.equal(second.result.product.metadata.catalog_skus[second.result.product.variants[0].sku], sku)
  const products = await container.resolve("query").graph({ entity: "product", filters: { id: [original.id, second.result.product.id] }, fields: ["id", "variants.id", "variants.prices.amount", "variants.inventory_items.inventory_item_id", "variants.inventory_items.inventory.location_levels.stocked_quantity"] })
  const a = products.data.find((p: any) => p.id === original.id).variants[0]
  const b = products.data.find((p: any) => p.id === second.result.product.id).variants[0]
  assert.notEqual(a.inventory_items[0].inventory_item_id, b.inventory_items[0].inventory_item_id)
  assert.equal(Number(a.prices[0].amount), 1000)
  assert.equal(Number(b.prices[0].amount), 1200)
  assert.equal(Number(a.inventory_items[0].inventory.location_levels[0].stocked_quantity), 9)
  assert.equal(Number(b.inventory_items[0].inventory.location_levels[0].stocked_quantity), 4)
  const edited = await invoke(updateOffer, vendorB, { variants: [{ id: b.id, sku, price: 1300, inventory_quantity: 2 }] }, { id: second.result.product.id })
  assert.equal(edited.status, 200, JSON.stringify(edited.result))
  assert.equal(edited.result.variant_matrix.variants[0].sku, sku)
  const levels = await container.resolve("inventory").listInventoryLevels({ inventory_item_id: [a.inventory_items[0].inventory_item_id, b.inventory_items[0].inventory_item_id] })
  assert.equal(Number(levels.find((l: any) => l.inventory_item_id === a.inventory_items[0].inventory_item_id).stocked_quantity), 9)
  assert.equal(Number(levels.find((l: any) => l.inventory_item_id === b.inventory_items[0].inventory_item_id).stocked_quantity), 2)
  const badEdit = await invoke(updateOffer, vendorB, { variants: [{ id: b.id, sku: "DIFFERENT-PRODUCT" }] }, { id: second.result.product.id })
  assert.equal(badEdit.status, 409)
  const conflict = await invoke(createOffer, vendorB, { ...payload(100, 1), title: "Completely different toaster" })
  assert.equal(conflict.status, 409)
  assert.equal((await invoke(createOffer, vendorB, payload(100, 1))).status, 409)
  const unauthorized = await invoke(createOffer, vendorC, secondPayload)
  assert.equal(unauthorized.status, 400)
  assert.equal(unauthorized.result.error, "brand_authorization_required")
  await brandAuth.createVendorBrandAuthorizations({ vendor_id: vendorC.id, brand_name: brand.toLowerCase(), authorization_file_url: "https://example.invalid/qa.pdf", authorization_file_key: "qa", verified: true })
  const concurrent = await Promise.all([invoke(createOffer, vendorC, payload(700, 3)), invoke(createOffer, vendorC, payload(800, 5))])
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409])
  const refreshed = await loadShareProduct(container, original.id)
  assert.equal(refreshed.metadata.vendor_id, vendorA.id)
  console.log("CATALOG QA PASS: authenticated share, images, token rejection, independent prices/inventory, stock updates, SKU conflict, same-vendor duplicate, concurrent submissions, brand authorization")
}
