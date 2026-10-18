import { test } from "node:test"
import assert from "node:assert/strict"
import { chooseOffer, chooseOfferDecision, publicSellerOffers, type OfferCandidate } from "../vendor-offer-routing"

const offers: OfferCandidate[] = [
  { variant_id: "a", product_id: "pa", vendor_id: "va", sku: "SAME-1", available: 4, prices: [100] },
  { variant_id: "b", product_id: "pb", vendor_id: "vb", sku: "SAME-1", available: 9, prices: [100] },
  { variant_id: "c", product_id: "pc", vendor_id: "vc", sku: "SAME-1", available: 9, prices: [100] },
  { variant_id: "d", product_id: "pd", vendor_id: "vd", sku: "SAME-1", available: 20, prices: [110] },
]

test("only matching price and available stock can be assigned", () => {
  assert.equal(chooseOffer(offers, 2, 100, [], () => 0)?.vendor_id, "va")
  assert.equal(chooseOffer(offers, 2, 110)?.vendor_id, "vd")
})

test("unknown distance is decided by a random draw", () => {
  assert.equal(chooseOffer(offers, 2, 100, [], () => 0)?.vendor_id, "va")
  assert.equal(chooseOffer(offers, 2, 100, [], () => 1)?.vendor_id, "vb")
})

test("reassignment excludes previous vendors and requires stock and same price", () => {
  assert.equal(chooseOffer(offers, 2, 100, ["vb"], () => 1)?.vendor_id, "vc")
  assert.equal(chooseOffer(offers, 10, 100), null)
  assert.equal(chooseOffer(offers, 2, 99), null)
})

test("nearest verified postal centroid wins even when another vendor has more stock", () => {
  const located = offers.slice(0, 3).map((offer, index) => ({ ...offer,
    latitude: 19.1 + index * 0.15, longitude: 72.8, store_pincode: `40110${index}` }))
  const decision = chooseOfferDecision(located, 1, 100, [],
    { postal_code: "401107", latitude: 19.11, longitude: 72.8 }, () => 0)
  assert.equal(decision.selected?.vendor_id, "va")
  assert.equal(decision.reason, "nearest_postal_centroid")
  assert.equal(decision.candidates.length, 3)
})

test("vendors within five kilometres of each other receive a random tie break", () => {
  const located = offers.slice(0, 2).map((offer, index) => ({ ...offer,
    latitude: 19.1 + index * 0.005, longitude: 72.8 }))
  const decision = chooseOfferDecision(located, 1, 100, [],
    { latitude: 19.1, longitude: 72.8 }, () => 1)
  assert.equal(decision.selected?.vendor_id, "vb")
  assert.equal(decision.reason, "equal_distance_random")
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
