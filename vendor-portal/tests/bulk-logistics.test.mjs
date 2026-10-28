import { createRequire } from "node:module"
const load = createRequire(import.meta.url)
const { test } = load("node:test"), assert = load("node:assert/strict")
const fs = load("node:fs"), ts = load("typescript")
load.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
const { parseRows } = load("../lib/bulk-upload.ts")
const { bulkQuoteFresh, pricingFromBulkQuote, refreshBulkLogistics, prepareBulkProduct } = load("../lib/bulk-logistics.ts")
const { resolveBulkListing } = load("../lib/bulk-pricing.ts")
const { buildBulkPayload } = load("../lib/bulk-payload.ts")
const { bulkSubmissionIssues } = load("../lib/bulk-submission.ts")

const quote = (now, fee = 100, life = 900_000) => ({ success: true, freight_charge: fee, courier_name: "Courier", pickup_pincode: "400001", delivery_pincode: "110001", quoted_at: new Date(now).toISOString(), expires_at: new Date(now + life).toISOString(), routes: [{ status: "quoted", quote: { freight_charge: fee } }], coverage_complete: true })
const makeRow = (sku = "test-1") => parseRows([{ Title: sku, SKU: sku, Brand: "Test", "Tax Code": "GST_18", "Price INR": "1000", "Inventory Count": "5", Length: "10", Width: "10", Height: "10", Weight: "0.5" }], [], [])[0]
const priced = (sku, now) => { const row = makeRow(sku); row.listingPricing = pricingFromBulkQuote(row, quote(now), now); return row }

test("selective refresh reuses fresh quotes and preserves custom prices", async () => {
  const now = Date.now(), rows = [priced("fresh", now), priced("expired", now - 1000_000), makeRow("missing")]
  rows[1].listingPricing.listingPrice = "1700.25"
  let calls = 0
  const decisions = new Map()
  const failures = await refreshBulkLogistics(rows, async () => { calls++; return quote(now) }, { now: () => now, onDecision: (sku, d) => decisions.set(sku, d) })
  assert.deepEqual(failures, [])
  assert.equal(calls, 2)
  assert.equal(decisions.has("fresh"), false)
  assert.equal(decisions.get("expired").listingPrice, "1700.25")
  assert.equal(decisions.get("expired").requiresReview, false)
})

test("a slow 999-product submission never needs all 999 quotes fresh at once", async t => {
  let now = Date.now(), calls = 0, created = 0
  t.mock.method(Date, "now", () => now)
  const rows = Array.from({ length: 999 }, (_, i) => priced(`product-${i}`, now))
  const estimate = async () => { calls++; return quote(now) }
  for (const row of rows) {
    now += 60_000 // A much slower upload than the 15-minute lifetime of a quote.
    const prepared = await prepareBulkProduct([row], estimate, () => {}, () => now)
    assert.equal(prepared.needsReview, false)
    assert.equal(bulkQuoteFresh(prepared.rows[0], now, 0), true)
    buildBulkPayload(prepared.rows, {}, true)
    created++
  }
  assert.equal(created, 999)
  assert.ok(calls > 900 && calls < 999, `Only products whose original quotes expired refreshed: ${calls}`)
})

for (const manual of [false, true]) test(`changed freight pauses submission for review (manual price: ${manual})`, async () => {
  const now = Date.now(), row = priced("changed", now - 1000_000)
  if (manual) row.listingPricing.listingPrice = "1777.50"
  const previous = row.listingPricing.listingPrice
  const prepared = await prepareBulkProduct([row], async () => quote(now, 120), () => {}, () => now)
  const updated = prepared.rows[0]
  assert.equal(prepared.needsReview, true)
  assert.equal(updated.listingPricing.requiresReview, true)
  if (manual) assert.equal(updated.listingPricing.listingPrice, previous)
  else assert.notEqual(updated.listingPricing.listingPrice, previous)
  assert.throws(() => buildBulkPayload(prepared.rows, {}, true), /Review updated shipping/)
  updated.listingPricing.requiresReview = false // Explicit vendor acknowledgement in the UI.
  assert.doesNotThrow(() => buildBulkPayload(prepared.rows, {}, true))
})

test("failed refresh retains the old decision but cannot create a payload", async () => {
  const now = Date.now(), row = priced("failed", now - 1000_000), old = structuredClone(row.listingPricing)
  await assert.rejects(prepareBulkProduct([row], async () => { throw Error("Courier unavailable") }, () => {}, () => now), /Courier unavailable/)
  assert.deepEqual(row.listingPricing, old)
  assert.throws(() => buildBulkPayload([row], {}, true), /expired/)
})

test("only the guarded workflow may start with an expired quote; payloads stay strict", () => {
  const row = priced("expired", Date.now() - 1000_000)
  assert.throws(() => resolveBulkListing(row), /expired/)
  const check = r => bulkSubmissionIssues([r], {}, [], false, [], {}, { refreshExpiredBeforeSubmit: true })
  assert.deepEqual(check(row), [])
  row.listingPricing.requiresReview = true
  assert.match(check(row).join(" "), /Review updated shipping/)
  row.listingPricing.requiresReview = false
  row.listingPricing.listingPrice = "0"
  assert.match(check(row).join(" "), /valid listing price/)
  row.listingPricing.listingPrice = "1000"
  row.listingPricing.shippingEstimate.expires_at = "invalid"
  assert.match(check(row).join(" "), /expired/)
})

test("bounded workers share identical package requests and ignore successful/invalid rows", async () => {
  const now = Date.now(), rows = Array.from({ length: 100 }, (_, i) => makeRow(`row-${i}`))
  rows[0].status = "success"; rows[1].errors = ["invalid"]
  let calls = 0, active = 0, peak = 0, updates = 0
  const failures = await refreshBulkLogistics(rows, async () => { calls++; active++; peak = Math.max(peak, active); await new Promise(resolve => setImmediate(resolve)); active--; return quote(now) }, { onDecision: () => updates++ })
  assert.deepEqual(failures, [])
  assert.equal(calls, 1)
  assert.equal(updates, 98)
  assert.ok(peak <= 3)
})

test("cancellation and changed source attributes suppress stale writes", async () => {
  const now = Date.now(), row = makeRow("cancel"), controller = new AbortController()
  let updates = 0
  await refreshBulkLogistics([row], async () => { controller.abort(); return quote(now) }, { signal: controller.signal, onDecision: () => updates++ })
  assert.equal(updates, 0)
  await refreshBulkLogistics([row], async () => quote(now), { getRow: () => ({ ...row, weight: "2" }), onDecision: () => updates++ })
  assert.equal(updates, 0)
})

test("different packages never exceed three in-flight courier requests", async () => {
  const rows = Array.from({ length: 99 }, (_, i) => ({ ...makeRow(`unique-${i}`), weight: String((i + 1) / 100) }))
  let active = 0, peak = 0, calls = 0
  await refreshBulkLogistics(rows, async () => {
    calls++; active++; peak = Math.max(peak, active)
    await new Promise(resolve => setImmediate(resolve))
    active--; return quote(Date.now())
  }, { onDecision: () => {} })
  assert.equal(calls, 99)
  assert.equal(peak, 3)
})

test("refreshing multiple variants fails closed if an earlier refreshed variant expires", async t => {
  let now = Date.now()
  const start = now
  t.mock.method(Date, "now", () => now)
  const rows = [makeRow("variant-a"), { ...makeRow("variant-b"), weight: "2" }]
  await assert.rejects(prepareBulkProduct(rows, async () => {
    const result = quote(now)
    // Let the next response take longer than an earlier quote's entire lifetime.
    if (now > start) now += 1_000_000
    else now++
    return result
  }, () => {}, () => now), /fresh usable|expired/)
})

test("manual edit made while a refresh is in flight is preserved", async () => {
  const now = Date.now(), row = priced("editing", now - 1000_000)
  let latest = row, result
  await refreshBulkLogistics([row], async () => { latest = { ...row, listingPricing: { ...row.listingPricing, listingPrice: "1900" } }; return quote(now) }, { getRow: () => latest, onDecision: (_, d) => { result = d } })
  assert.equal(result.listingPrice, "1900")
})

test("expired shared results are refetched and invalid fresh responses never unblock submission", async () => {
  const now = Date.now(), row = makeRow("bad-response")
  let calls = 0
  const failures = await refreshBulkLogistics([row], async () => { calls++; return quote(now - 1000_000) }, { onDecision: () => assert.fail("must not accept expired quote") })
  assert.equal(calls, 2)
  assert.equal(failures.length, 1)
})
