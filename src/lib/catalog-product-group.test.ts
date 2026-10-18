import assert from "node:assert/strict"
import test from "node:test"
import { groupCatalogProductCards, mergeCatalogProductDetails } from "./catalog-product-group.ts"
import type { DetailedProduct } from "./medusa.ts"

const catalogId = "product-a"

function detail(id: string, rows: Array<[string, string, number, number]>): DetailedProduct {
  return {
    id,
    title: "Black shoes",
    price: rows[0][2],
    mrp: rows[0][2],
    discount: 0,
    currency: "INR",
    images: [],
    categories: [],
    tags: [],
    highlights: [],
    options: [
      { id: "size", title: "Size", values: rows.map(row => row[0]) },
      { id: "colour", title: "Colour", values: ["Black"] },
    ],
    variants: rows.map(([size, suffix, price, stock]) => ({
      id: `${id}-${suffix}`,
      options: { Size: size, Colour: "Black" },
      price,
      mrp: price,
      discount: 0,
      inventory_quantity: stock,
      manage_inventory: true,
    })),
  }
}

test("one catalog card uses the cheapest stocked seller", () => {
  const cards = groupCatalogProductCards([
    { id: catalogId, name: "Black shoes", image: "a.jpg", price: 600, mrp: 900, discount: 33, inventory_quantity: 2, variant_id: "a" },
    { id: "product-b", catalog_product_id: catalogId, name: "Black shoes", image: "b.jpg", price: 500, mrp: 900, discount: 44, inventory_quantity: 3, variant_id: "b" },
  ])
  assert.equal(cards.length, 1)
  assert.equal(cards[0].id, catalogId)
  assert.equal(cards[0].price, 500)
  assert.equal(cards[0].variant_id, "b")
})

test("sizes sold only by another vendor remain available", () => {
  const merged = mergeCatalogProductDetails([
    detail(catalogId, [["34", "34", 600, 2], ["36", "36", 600, 3]]),
    detail("product-b", [["38", "38", 500, 5]]),
  ], catalogId)
  assert.deepEqual(merged.options.find(option => option.title === "Size")?.values, ["34", "36", "38"])
  assert.equal(merged.variants.find(variant => variant.options.Size === "38")?.id, "product-b-38")
  assert.equal(merged.variant_id, "product-b-38")
})

test("an in-stock seller wins over a cheaper out-of-stock seller for the same size", () => {
  const merged = mergeCatalogProductDetails([
    detail(catalogId, [["38", "38", 400, 0]]),
    detail("product-b", [["38", "38", 500, 5]]),
  ], catalogId)
  assert.equal(merged.variants.length, 1)
  assert.equal(merged.variants[0].id, "product-b-38")
})
