import { createRequire } from "node:module"
const load = createRequire(import.meta.url)
const { test, after } = load('node:test')
const assert = load('node:assert/strict')
const fs = load('node:fs')
const ts = load('typescript')
load.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename)
const axios = load('axios').default
const { AxiosError } = load('axios')
const originalAdapter = axios.defaults.adapter
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const originalMode = process.env.NODE_ENV
process.env.NODE_ENV = 'test'
Object.defineProperty(globalThis, 'window', { configurable: true, value: {} })
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => 'fixture-vendor-token' } })
const api = load('../lib/api/client.ts')
const calls = []
let respond = async () => { throw new Error('Unexpected request: no network is allowed in this suite') }
axios.defaults.adapter = async config => {
  calls.push(config)
  return { status: 200, statusText: 'OK', headers: {}, config, data: await respond(config) }
}
const body = config => typeof config.data === 'string' ? JSON.parse(config.data) : config.data
function fixture(value) { calls.length = 0; respond = async () => value }
function fail(value) { calls.length = 0; respond = async () => { throw value } }
function httpError(data, status = 400) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, { data, status, statusText: 'Error', headers: {}, config: {} })
}
after(() => {
  axios.defaults.adapter = originalAdapter
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete globalThis.window
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage); else delete globalThis.localStorage
  if (originalMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalMode
})

test('ordinary requests preserve URLs, auth/key headers, payload and response identity', async () => {
  const value = { vendor: { id: 'vendor_1', store_name: null, metadata: null } }
  fixture(value)
  assert.equal(await api.apiRequest('/vendor/profile', { method: 'PUT', data: { store_name: '' } }), value)
  assert.equal(calls[0].url, '/api/medusa/vendor/profile')
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer fixture-vendor-token')
  assert.equal(calls[0].headers.get('Content-Type'), 'application/json')
  assert.deepEqual(body(calls[0]), { store_name: '' })
})
test('caller-supplied header/config behavior is preserved', async () => {
  fixture({ ok: true })
  await api.apiRequest('/fixture', { method: 'PATCH', headers: { 'X-Request': 'fixture' }, params: { q: '' }, timeout: 1234 })
  assert.equal(calls[0].headers.get('X-Request'), 'fixture')
  assert.deepEqual(calls[0].params, { q: '' }); assert.equal(calls[0].timeout, 1234)
})
test('login keeps its separate headers and returns nullable vendor/reset flag unchanged', async () => {
  const value = { token: 'fixture', vendor_user: { id: 'vu_1', email: 'vendor@example.com', vendor_id: null, must_reset_password: true }, vendor: null }
  fixture(value)
  assert.equal(await api.vendorAuthApi.login('vendor@example.com', 'fixture-password'), value)
  assert.equal(calls[0].url, '/api/medusa/vendor/auth/login')
  assert.deepEqual(body(calls[0]), { email: 'vendor@example.com', password: 'fixture-password' })
  assert.equal(calls[0].headers.has('Authorization'), false)
})
test('empty and redacted results remain unchanged across typed response contracts', async () => {
  for (const [call, value] of [
    [() => api.vendorProductsApi.list(), { products: [], count: 0 }],
    [() => api.vendorOrdersApi.list({ limit: 1 }), { orders: [{ id: 'order_1', email: null, display_id: 123, customer_details_hidden: true, shipping_address: { first_name: null, phone: null } }] }],
    [() => api.vendorInventoryApi.list(), { success: true, inventory: [], count: 0, message: 'No products found' }],
    [() => api.vendorCustomersApi.list(), { customers: [{ id: 'cus_1', email: null, first_name: null, last_name: null }] }],
    [() => api.vendorCategoriesApi.list(), { product_categories: [], count: 0 }],
    [() => api.vendorCollectionsApi.list(), { collections: [], count: 0 }],
    [() => api.vendorTypesApi.list(), { product_types: [], count: 0 }],
    [() => api.vendorTagsApi.list(), { product_tags: [], count: 0 }],
    [() => api.vendorPayoutsApi.list(), { payouts: [], totals: { total_credited: 0, total_commission: 0, total_gross: 0 }, count: 0 }],
  ]) { fixture(value); assert.equal(await call(), value) }
})
test('product details preserve optional matrix/summary nulls and custom metadata', async () => {
  const value = { product: { id: 'prod_1', thumbnail: null, handle: null, metadata: { custom: { nested: true } } }, variant_summary: null, variant_matrix: null, color_images: {}, primary_visual_option: null }
  fixture(value); assert.equal(await api.vendorProductsApi.get('prod_1'), value)
})
test('mutations retain existing methods, paths, nulls, zero inventory and custom metadata', async () => {
  const product = { title: 'Kettle', variants: [{ inventory_quantity: 0 }], metadata: { custom_field: { retained: true } } }
  for (const [call, method, url, expected] of [
    [() => api.vendorProductsApi.create(product), 'post', '/vendor/products', product],
    [() => api.vendorProductsApi.update('prod_1', { discounted_price: null }), 'put', '/vendor/products/prod_1', { discounted_price: null }],
    [() => api.vendorProductsApi.updateVariants('prod_1', { variants: [] }), 'patch', '/vendor/products/prod_1/variants', { variants: [] }],
    [() => api.vendorProductsApi.setStatus('prod_1', 'draft'), 'post', '/vendor/products/prod_1/status', { action: 'draft' }],
    [() => api.vendorProfileApi.updateProfile({ store_banner: null }), 'put', '/vendor/profile', { store_banner: null }],
    [() => api.vendorOrdersApi.chooseEasyShipping('o1', { courier_id: 1, rate: 0 }), 'post', '/vendor/orders/o1/shipping', { method: 'easy', courier_id: 1, rate: 0 }],
    [() => api.vendorReturnsApi.updateStatus('r1', 'received'), 'post', '/vendor/returns/r1/status', { action: 'received' }],
    [() => api.vendorInventoryApi.update('v1', 0), 'post', '/vendor/inventory/update', { variant_id: 'v1', quantity: 0 }],
  ]) {
    fixture({ ok: true }); await call()
    assert.equal(calls[0].method, method); assert.equal(calls[0].url, '/api/medusa' + url); assert.deepEqual(body(calls[0]), expected)
  }
})
test('query parameters and shipping package units are unchanged', async () => {
  fixture({ success: true })
  await api.vendorShippingApi.estimateRate({ length: 22, width: 20, height: 24, weight: 1.2, declared_value: 2150, refresh: true })
  assert.equal(calls[0].url, '/api/medusa/vendor/shipping/estimate-rate?weight=1.2&length=22&width=20&height=24&declared_value=2150&refresh=true')
  fixture({ products: [] }); await api.vendorProductsApi.list({ limit: 0, offset: 0, all: true, q: 'red shoe', status: 'draft' })
  assert.equal(calls[0].url, '/api/medusa/vendor/products?all=1&limit=0&offset=0&q=red+shoe&status=draft')
})
test('uploads preserve multipart fields, auth and legacy/direct response support', async () => {
  const file = new File(['fixture'], 'banner.png', { type: 'image/png' })
  const upload = { files: [{ type: 'logo', url: 'https://example.com/logo.png', key: 'logo' }, { type: 'banner', url: 'https://example.com/banner.png', key: 'banner' }] }
  fixture(upload)
  assert.equal(await api.vendorProfileApi.uploadBanner(file, 'store'), upload.files[1])
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer fixture-vendor-token')
  assert.equal(calls[0].data.get('type'), 'banner'); assert.equal(calls[0].data.get('vendorHint'), 'store')
  assert.equal(calls[0].data.get('file').name, 'banner.png')
  const direct = { url: 'https://example.com/logo.png', key: 'logo' }
  fixture(direct); assert.equal(await api.vendorProfileApi.uploadLogo(file, 'store'), direct)
  fixture(upload); assert.equal(await api.vendorSignupApi.uploadFile(file, 'logo', 'store'), upload)
  assert.equal(calls[0].headers.has('Authorization'), false)
  fixture(upload); assert.equal(await api.vendorProductsApi.uploadImage(file), upload)
  assert.equal(calls[0].url, '/api/medusa/vendor/products/upload-image')
  assert.equal(calls[0].method, 'post')
  assert.equal(calls[0].data.get('file').name, 'banner.png')
  assert.equal(calls[0].headers.get('Authorization'), 'Bearer fixture-vendor-token')
  assert.notEqual(calls[0].headers.get('Content-Type'), 'application/json')
  fixture(upload); assert.deepEqual(await api.vendorReportsApi.uploadImage(file, 'store'), { url: upload.files[0].url, key: 'logo' })
})
test('missing upload URL retains existing error status and message', async () => {
  const file = new File(['fixture'], 'letter.png', { type: 'image/png' })
  fixture({ files: [] })
  await assert.rejects(api.vendorProfileApi.uploadLogo(file, 'store'), e => e instanceof api.ApiError && e.status === 0 && e.message === 'Upload returned no image URL')
  fixture({ files: [] })
  await assert.rejects(api.vendorReportsApi.uploadImage(file, 'store'), e => e instanceof api.ApiError && e.status === 500 && e.message === 'Upload succeeded but no file URL was returned')
})
test('invoice data remains a Blob with the same download request', async () => {
  const pdf = new Blob(['fixture'], { type: 'application/pdf' }); fixture(pdf)
  assert.equal(await api.vendorOrdersApi.generateInvoice('o1'), pdf)
  assert.equal(calls[0].responseType, 'blob'); assert.equal(calls[0].method, 'post')
})
test('error envelopes, HTML 404, raw response data and non-Error throws retain their behavior', async () => {
  for (const [value, expected] of [[{ message: 'Not approved', issues: [] }, 'Not approved'], ['<pre>Cannot GET /vendor/missing</pre>', 'Cannot GET /vendor/missing'], [[], 'API request failed'], [{}, 'API request failed']]) {
    fail(httpError(value, 404))
    await assert.rejects(api.apiRequest('/fixture'), e => e instanceof api.ApiError && e.status === 404 && e.message === expected && e.data === value)
  }
  const original = new api.ApiError(409, 'Duplicate SKU', { sku: 'KE001' }); fail(original)
  await assert.rejects(api.apiRequest('/fixture'), e => e === original)
  const thrown = { message: 'Plain thrown object', detail: true }; fail(thrown)
  await assert.rejects(api.apiRequest('/fixture'), e => e.status === 0 && e.message === thrown.message && e.data === thrown)
  fail(null); await assert.rejects(api.apiRequest('/fixture'), e => e.status === 0 && e.message === 'Unknown error occurred' && e.data === null)
})
test('network errors preserve status zero and diagnostic payload', async () => {
  fail(new AxiosError('Network Error', 'ERR_NETWORK'))
  const warn = console.warn; console.warn = () => {}
  try { await assert.rejects(api.apiRequest('/fixture'), e => e.status === 0 && e.message.includes('Network error: Unable to reach backend') && e.data.originalError === 'Network Error') }
  finally { console.warn = warn }
})
test('direct request errors keep their endpoint-specific fallback messages', async () => {
  const file = new File(['fixture'], 'image.png')
  for (const [call, fallback] of [
    [() => api.vendorAuthApi.login('x', 'y'), 'Login failed'],
    [() => api.vendorSignupApi.signup({ name: 'Vendor', email: 'v@example.com' }), 'Signup failed'],
    [() => api.vendorSignupApi.validate('email', 'v@example.com'), 'Validation failed'],
    [() => api.vendorSignupApi.uploadFile(file, 'logo', 'store'), 'Upload failed'],
    [() => api.vendorProductsApi.uploadImage(file), 'Upload failed'],
  ]) {
    fail(httpError({}, 422)); await assert.rejects(call(), e => e.status === 422 && e.message === fallback)
    fail(new Error('Unexpected failure')); await assert.rejects(call(), e => e.status === 0 && e.message === 'Unexpected failure')
  }
})
test('payout fallback is used only for 404, and empty earnings makes no request', async () => {
  calls.length = 0; respond = async config => {
    if (config.url.endsWith('/summary')) throw httpError({ message: 'Not found' }, 404)
    return { summary: {}, payouts: [], totals: {}, count: 0 }
  }
  await api.vendorPayoutsApi.summary()
  assert.deepEqual(calls.map(c => c.url), ['/api/medusa/vendor/payouts/summary', '/api/medusa/vendor/payouts'])
  fail(httpError({ message: 'Forbidden' }, 403))
  await assert.rejects(api.vendorPayoutsApi.summary(), e => e.status === 403); assert.equal(calls.length, 1)
  calls.length = 0; assert.deepEqual(await api.vendorPayoutsApi.earningsByOrders([]), { earnings: {} }); assert.equal(calls.length, 0)
})
test('unscoped order lists and counts deduplicate in flight and recover after rejection', async () => {
  for (const call of [() => api.vendorOrdersApi.list(), () => api.vendorOrdersApi.counts()]) {
    calls.length = 0
    let resolve
    const pending = new Promise(done => { resolve = done })
    respond = async () => pending
    const a = call(), b = call()
    resolve({ orders: [], count: 0 })
    assert.deepEqual(await a, await b); assert.equal(calls.length, 1)
    fail(httpError({ message: 'Unavailable' }, 503)); await assert.rejects(call())
    fixture({ orders: [] }); await call(); assert.equal(calls.length, 1)
  }
})
