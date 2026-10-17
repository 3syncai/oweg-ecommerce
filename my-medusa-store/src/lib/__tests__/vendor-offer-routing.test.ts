import { test } from "node:test"
import assert from "node:assert/strict"
import { chooseOffer, publicSellerOffers, type OfferCandidate } from "../vendor-offer-routing"

const offers: OfferCandidate[] = [
  { variant_id: "a", product_id: "pa", vendor_id: "va", sku: "SAME-1", available: 4, prices: [100] },
  { variant_id: "b", product_id: "pb", vendor_id: "vb", sku: "SAME-1", available: 9, prices: [100] },
  { variant_id: "c", product_id: "pc", vendor_id: "vc", sku: "SAME-1", available: 9, prices: [100] },
  { variant_id: "d", product_id: "pd", vendor_id: "vd", sku: "SAME-1", available: 20, prices: [110] },
]

test("highest available stock wins among offers at the customer price", () => {
  assert.equal(chooseOffer(offers, 2, 100, [], () => 0)?.vendor_id, "vb")
  assert.equal(chooseOffer(offers, 2, 110)?.vendor_id, "vd")
})

test("equal stock is decided by a random draw", () => {
  assert.equal(chooseOffer(offers, 2, 100, [], () => 0)?.vendor_id, "vb")
  assert.equal(chooseOffer(offers, 2, 100, [], () => 1)?.vendor_id, "vc")
})

test("reassignment excludes previous vendors and requires stock and same price", () => {
  assert.equal(chooseOffer(offers, 2, 100, ["vb"])?.vendor_id, "vc")
  assert.equal(chooseOffer(offers, 10, 100), null)
  assert.equal(chooseOffer(offers, 2, 99), null)
})

test("customer offers show the cheapest in-stock seller first, then higher stock on a price tie", () => {
  const displayed = publicSellerOffers([
    ...offers,
    { variant_id: "e", product_id: "pe", vendor_id: "ve", sku: "SAME-1", available: 0, prices: [50] },
    { variant_id: "f", product_id: "pf", vendor_id: "vf", sku: "SAME-1", available: 3, prices: [130, 90], store_name: "Budget Store" },
  ])
  assert.deepEqual(displayed.map(offer => offer.variant_id), ["f", "b", "c", "a", "d"])
  assert.equal(displayed[0].store_name, "Budget Store")
  assert.equal(displayed[0].price, 90)
})
