import { createRequire } from "node:module"
const load = createRequire(import.meta.url)
const { test } = load('node:test')
const assert = load('node:assert/strict')
const fs = load('node:fs')
const ts = load('typescript')
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
const { savedAuthorization, submitBrandLetters } = load('../lib/bulk-brand-authorization.ts')
const { bulkSubmissionIssues } = load('../lib/bulk-submission.ts')
const { parseRows, brandReady } = load('../lib/bulk-upload.ts')
const { bulkPricingSignature } = load('../lib/bulk-pricing.ts')
const file = new File(['fixture'], 'letter.pdf', { type: 'application/pdf' })
const selected = previous => ({ status: 'selected', file, previous: previous || { status: 'missing' } })
const brands = [{ key: 'pigeon', display: 'Pigeon' }, { key: 'bajaj', display: 'Bajaj' }]
const readyRow = () => {
  const [row] = parseRows([{ Title: 'Pigeon steel cooker', Brand: 'Pigeon', 'Tax Code': 'GST_18', 'MRP INR': 1000, 'Inventory Count': 5, 'Length': 25, 'Width': 20, 'Height': 20, 'Weight': 1.2 }], [], [])
  row.listingPricing = { signature: bulkPricingSignature(row), logisticsFee: 100, listingPrice: '1300', suggestedPrice: 1300,
    shippingEstimate: { success: true, freight_charge: 100, routes: [{ status: 'quoted', quote: { freight_charge: 100 } }], coverage_complete: true, expires_at: new Date(Date.now() + 60000).toISOString() } }
  return row
}
const issues = (row, auth = selected(), images = {}, refs = [], uploading = false) => bulkSubmissionIssues([row], images, refs, uploading, brands.slice(0, 1), { pigeon: auth })

test('selected files are ready for submit without being saved; cancelling restores the original letter', () => {
  const pending = { status: 'pending', fileUrl: 'https://example.com/original.pdf' }
  const draft = selected(pending)
  assert.equal(brandReady(draft), true)
  assert.equal(brandReady({ status: 'selected' }), false)
  assert.equal(brandReady({ status: 'preparing', file }), false)
  assert.equal(savedAuthorization(draft), pending)
  assert.equal(savedAuthorization({ ...draft, file: new File(['new'], 'new.pdf') }), pending)
  assert.equal(brandReady(pending), true)
})

test('only Submit uploads selected letters once, skipping already saved authorizations', async () => {
  const calls = []
  const states = { pigeon: selected(), bajaj: { status: 'pending', fileUrl: 'https://example.com/saved.pdf' } }
  assert.deepEqual(calls, [])
  await submitBrandLetters(brands, states, async (brand, actual) => { calls.push(brand); assert.equal(actual, file); return 'https://example.com/new.pdf' }, (key, value) => { states[key] = value })
  assert.deepEqual(calls, ['Pigeon'])
  assert.deepEqual(states.pigeon, { status: 'uploaded', fileUrl: 'https://example.com/new.pdf' })
  await submitBrandLetters(brands, states, async () => { throw Error('must not reupload') }, () => {})
})

test('partial letter failure stops before product creation and retries only the failed selection', async () => {
  const states = { pigeon: selected(), bajaj: selected() }
  let products = 0
  const change = (key, value) => { states[key] = value }
  await assert.rejects(async () => {
    await submitBrandLetters(brands, states, async brand => { if (brand === 'Bajaj') throw Error('Upload unavailable'); return 'https://example.com/first.pdf' }, change)
    products++
  }, /Bajaj: Upload unavailable/)
  assert.equal(products, 0)
  assert.equal(states.pigeon.status, 'uploaded')
  assert.equal(states.bajaj.status, 'selected')
  assert.equal(states.bajaj.file, file)
  assert.match(states.bajaj.message, /Upload unavailable/)
  const retried = []
  await submitBrandLetters(brands, states, async brand => { retried.push(brand); return 'https://example.com/retry.pdf' }, change)
  assert.deepEqual(retried, ['Bajaj'])
})

test('malformed success without a URL keeps the selection available for retry', async () => {
  const states = { pigeon: selected() }
  await assert.rejects(submitBrandLetters(brands.slice(0, 1), states, async () => '', (key, value) => { states[key] = value }), /did not return/)
  assert.equal(states.pigeon.status, 'selected')
  assert.equal(states.pigeon.file, file)
})

test('ready products accept local letters or saved pending letters without blocking on approval', () => {
  assert.deepEqual(readyRow().errors, [])
  assert.deepEqual(issues(readyRow()), [])
  assert.deepEqual(issues(readyRow(), { status: 'pending', fileUrl: 'https://example.com/pending.pdf' }), [])
})

test('partial coverage permits submission and preserves the calculator amount and selected quote', () => {
  const row = readyRow()
  const decision = structuredClone(row.listingPricing)
  row.listingPricing.shippingEstimate.coverage_complete = false
  row.listingPricing.shippingEstimate.routes.push({ status: 'error', pincode: '190001' }, { status: 'unavailable', pincode: '194101' })
  assert.deepEqual(issues(row), [])
  assert.equal(row.listingPricing.logisticsFee, decision.logisticsFee)
  assert.equal(row.listingPricing.listingPrice, decision.listingPrice)
})

for (const value of [undefined, { success: false, freight_charge: 0, routes: [] }, { success: true, freight_charge: 0, routes: [{ status: 'error' }] }, { success: true, freight_charge: NaN, routes: [{ status: 'quoted', quote: { freight_charge: 100 } }] }]) {
  test('missing or unusable courier quotes still block submission: ' + JSON.stringify(value), () => {
    const row = readyRow()
    row.listingPricing.shippingEstimate = value
    assert.match(issues(row)[0], /No usable shipping quote.*refresh logistics/)
  })
}

test('expired quotes, changed package, and invalid listing prices each explain the blocker', () => {
  let row = readyRow(); row.listingPricing.shippingEstimate.expires_at = '2000-01-01'
  assert.match(issues(row)[0], /expired.*refresh logistics/)
  row = readyRow(); row.weight = 2
  assert.match(issues(row)[0], /Calculate listing price/)
  row = readyRow(); row.listingPricing.listingPrice = '0'
  assert.match(issues(row)[0], /valid listing price/)
})

test('row, image, preparing, missing authorization and empty-upload blockers are explicit', () => {
  const row = readyRow(); row.errors = ['Missing category']
  const result = issues(row, { status: 'missing' }, {}, ['cooker.jpg'], true).join(' ')
  assert.match(result, /Fix 1 row/); assert.match(result, /Upload 1 referenced/)
  assert.match(result, /finish uploading/); assert.match(result, /Choose a brand authorization letter for Pigeon/)
  assert.match(issues(readyRow(), { status: 'preparing', file, previous: { status: 'missing' } }).join(' '), /finish preparing/)
  assert.match(bulkSubmissionIssues([], {}, [], false, [], {}).join(' '), /No products/)
})
