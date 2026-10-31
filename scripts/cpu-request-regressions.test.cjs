const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const { createRequire } = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const flush = () => new Promise(resolve => setImmediate(resolve))

function load(relative, mocks = {}, globals = {}) {
  const file = path.join(root, relative), mod = { exports: {} }, local = createRequire(file)
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  vm.runInNewContext(js, { module: mod, exports: mod.exports, require: name => name in mocks ? mocks[name] : local(name), console, Date, URL, URLSearchParams, AbortController, queueMicrotask, ...globals }, { filename: file })
  return mod.exports
}

function browserHarness() {
  const intervals = new Map(), events = new Map(), effects = [], cleanups = [], states = []
  let sequence = 0
  const target = scope => ({
    addEventListener(name, fn) { const key = scope + name; if (!events.has(key)) events.set(key, new Set()); events.get(key).add(fn) },
    removeEventListener(name, fn) { events.get(scope + name)?.delete(fn) },
  })
  const document = { ...target('doc:'), visibilityState: 'visible' }
  const window = { ...target('win:'), setInterval: (fn, ms) => { intervals.set(++sequence, { fn, ms }); return sequence }, clearInterval: id => intervals.delete(id) }
  const react = { useState: initial => [states.length ? states.shift() : initial, () => {}], useRef: initial => ({ current: initial }), useEffect: fn => effects.push(fn), useCallback: fn => fn, useMemo: fn => fn(), createContext: () => ({ Provider: () => null }) }
  const globals = { document, window, localStorage: { getItem: () => 'vendor-a' }, setInterval: window.setInterval, clearInterval: window.clearInterval }
  return { intervals, events, effects, cleanups, states, react, globals,
    mount() { while (effects.length) { const cleanup = effects.shift()(); if (cleanup) cleanups.push(cleanup) } },
    unmount() { while (cleanups.length) cleanups.shift()() },
    emit(scope, name) { for (const fn of events.get(scope + ':' + name) || []) fn() },
    tick(ms) { for (const timer of intervals.values()) if (timer.ms === ms) timer.fn() },
  }
}

test('50 concurrent flash-sale cache misses make one upstream request; failures can retry', async () => {
  const { createFlashSaleCache } = load('src/lib/flash-sale-cache.ts')
  let now = 1000, calls = 0, finish
  const cached = createFlashSaleCache(() => now)
  const loader = () => { calls++; return new Promise(resolve => { finish = resolve }) }
  const requests = Array.from({ length: 50 }, () => cached(loader))
  assert.equal(calls, 1)
  finish({ active: true, flash_sale: { expires_at: new Date(10_000).toISOString() }, products: [{ id: 'a' }] })
  await Promise.all(requests)
  await cached(loader); assert.equal(calls, 1)
  now = 11_000
  await assert.rejects(cached(async () => { throw Error('offline') }), /offline/)
  const result = await cached(async () => ({ active: false, products: [] }))
  assert.equal(result.active, false)
})

test('expired sales are hidden and CDN lifetime never extends past a known expiry', async () => {
  const { currentFlashSale, flashSaleCacheSeconds, createFlashSaleCache } = load('src/lib/flash-sale-cache.ts')
  const expired = { active: true, flash_sale: { expires_at: new Date(1000).toISOString() }, products: [{ id: 'old' }] }
  assert.equal(currentFlashSale(expired, 1001).active, false)
  assert.equal(currentFlashSale(expired, 1001).products.length, 0)
  assert.equal(flashSaleCacheSeconds(expired, 1001), 0)
  assert.equal(flashSaleCacheSeconds({ flash_sale: { expires_at: new Date(9000).toISOString() } }, 1000), 8)
  const cached = createFlashSaleCache(() => 1001)
  assert.equal((await cached(async () => expired)).active, false)
})

test('flash-sale route keeps stock filtering, shares fetches and never forwards private credentials', async () => {
  let calls = 0, filtered = 0
  const helpers = load('src/lib/flash-sale-cache.ts')
  const route = load('src/app/api/medusa/flash-sale/products/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => ({ data, ...options }) } },
    '@/lib/flash-sale-cache': helpers,
    '@/lib/home-flash-sale': { inStockHomeFlashSale: async data => { filtered++; return { ...data, products: [{ id: 'stocked' }] } } },
    axios: { get: async (_, options) => {
      calls++
      assert.equal(options.headers.authorization, undefined)
      assert.equal(options.headers.cookie, undefined)
      assert.equal(options.timeout, 15000)
      await flush()
      return { data: { active: true, products: [{ id: 'out-of-stock' }, { id: 'stocked' }] } }
    } },
  }, { process: { env: { MEDUSA_BACKEND_URL: 'https://backend.example' } } })
  const results = await Promise.all(Array.from({ length: 20 }, () => route.GET({ nextUrl: new URL('https://shop.example/api/medusa/flash-sale/products?in_stock=1') })))
  assert.equal(calls, 1); assert.equal(filtered, 20)
  for (const result of results) {
    assert.equal(result.data.products.length, 1)
    assert.equal(result.data.products[0].id, 'stocked')
    assert.match(result.headers['Cache-Control'], /s-maxage=15/)
  }
})

test('flash-sale failures are not cached at the CDN and recover on retry', async () => {
  let failed = true
  const route = load('src/app/api/medusa/flash-sale/products/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => ({ data, ...options }) } },
    '@/lib/flash-sale-cache': load('src/lib/flash-sale-cache.ts'), '@/lib/home-flash-sale': {},
    axios: { get: async () => { if (failed) throw Error('offline'); return { data: { active: false, products: [] } } } },
  }, { process: { env: {} }, console: { warn() {} } })
  const request = { nextUrl: new URL('https://shop.example/api/medusa/flash-sale/products') }
  assert.equal((await route.GET(request)).headers['Cache-Control'], 'no-store')
  failed = false
  assert.match((await route.GET(request)).headers['Cache-Control'], /s-maxage=15/)
})

test('expired countdown makes no per-second API loop; hidden tabs stop flash-sale requests', async () => {
  const h = browserHarness()
  const sale = { active: true, flash_sale: { expires_at: new Date(Date.now() - 1000).toISOString() }, products: [] }
  h.states.push(sale, false, { days: 0, hours: 0, minutes: 0, seconds: 0 })
  let requests = 0
  const section = load('src/components/flash-sale/FlashSaleSection.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    axios: { get: async () => { requests++; return { status: 200, data: sale } } },
    'next/image': {}, 'next/link': {}, 'lucide-react': {},
    '@/contexts/AuthProvider': {}, '@/hooks/useWishlistMutations': {}, '@/components/modules/ProductCardQuickActions': {},
    './FlashSaleSection.module.css': {},
    '@/lib/flash-sale-display': load('src/lib/flash-sale-display.ts'),
  }, h.globals)
  section.default({}); h.mount(); await flush()
  for (let second = 0; second < 60; second++) { h.tick(1000); await flush() }
  assert.ok(requests <= 2, `Expiry caused ${requests} requests`)
  const before = requests
  h.globals.document.visibilityState = 'hidden'
  for (let minute = 0; minute < 60; minute++) { h.tick(60000); await flush() }
  assert.equal(requests, before)
  h.globals.document.visibilityState = 'visible'; h.emit('doc', 'visibilitychange'); await flush()
  assert.equal(requests, before + 1)
  h.unmount(); assert.equal(h.intervals.size, 0)
})

test('vendor consumers share in-flight pulse work, preserve invalidations, and stop on last unmount', async () => {
  const h = browserHarness(); let calls = 0, finish, invalidations = 0, pulses = 0
  const live = load('vendor-portal/lib/useVendorLive.ts', {
    react: h.react, '@/lib/api/client': { vendorPulseApi: { get: () => { calls++; return new Promise(resolve => { finish = resolve }) } } },
    '@/lib/page-cache': { clearPageCache() {} },
  }, h.globals)
  live.useVendorLive({ onPulse: () => pulses++, onInvalidate: () => invalidations++ })
  live.useVendorLive({ onPulse: () => pulses++, onInvalidate: () => invalidations++ })
  h.mount(); assert.equal(calls, 1)
  h.tick(10000); h.emit('win', 'focus'); h.emit('win', live.VENDOR_DATA_CHANGED); await flush()
  assert.equal(calls, 1)
  finish({ revision: 'one' }); await flush()
  assert.equal(pulses, 2); assert.equal(invalidations, 2)
  h.unmount(); assert.equal(h.intervals.size, 0)
  h.emit('win', 'focus'); await flush(); assert.equal(calls, 1)
  assert.equal([...h.events.values()].reduce((n, set) => n + set.size, 0), 0)
})

test('vendor pulse does not deliver a previous account response after token changes', async () => {
  const h = browserHarness(); let finish, delivered = 0
  const live = load('vendor-portal/lib/useVendorLive.ts', { react: h.react,
    '@/lib/api/client': { vendorPulseApi: { get: () => new Promise(resolve => { finish = resolve }) } }, '@/lib/page-cache': {},
  }, h.globals)
  live.useVendorLive({ onPulse: () => delivered++ }); h.mount()
  h.globals.localStorage.getItem = () => 'vendor-b'
  finish({ revision: 'private-a' }); await flush(); assert.equal(delivered, 0)
  h.unmount()
})

for (const relative of ['src/components/debug-controller/DebugControllerProvider.tsx', 'vendor-portal/components/debug-controller/DebugControllerProvider.tsx']) {
  test(`${relative}: hidden settings polls make zero requests and visibility resumes one`, async () => {
    const h = browserHarness(); let calls = 0
    h.globals.document.visibilityState = 'hidden'
    const provider = load(relative, { react: h.react, 'react/jsx-runtime': { jsx: () => null } }, { ...h.globals, fetch: async () => { calls++; return { ok: true, json: async () => ({ settings: {} }) } } })
    provider.DebugControllerProvider({ children: null }); h.mount()
    h.tick(30000); h.tick(300000); await flush(); assert.equal(calls, 0)
    h.globals.document.visibilityState = 'visible'; h.emit('doc', 'visibilitychange'); h.emit('doc', 'visibilitychange'); await flush()
    assert.equal(calls, 1)
    h.unmount(); assert.equal(h.intervals.size, 0)
  })
}

test('vendor middleware reads settings directly while preserving maintenance and login gates', async () => {
  let reads = 0, status = 'live'
  const response = { next: () => ({ type: 'next' }), redirect: url => ({ type: 'redirect', url: String(url) }) }
  const middleware = load('vendor-portal/middleware.ts', {
    'next/server': { NextResponse: response },
    './lib/vendor-redirect': { safeVendorRedirect: value => value || '/dashboard' },
    './lib/debug-controller/settings': { getDebugControllerSettings: async () => { reads++; return { siteStatus: status } } },
  }, { fetch: () => assert.fail('Middleware must not call its own HTTP settings API') })
  const request = url => { const nextUrl = new URL(url); nextUrl.clone = () => new URL(url); return { nextUrl, url, cookies: { get: () => undefined } } }
  const login = await middleware.middleware(request('https://vendor.example/products'))
  assert.match(login.url, /login\?redirect=/)
  status = 'maintenance'
  const maintenance = await middleware.middleware(request('https://vendor.example/products'))
  assert.equal(maintenance.url, 'https://vendor.example/maintenance')
  assert.equal(reads, 2)
  assert.equal(middleware.config.runtime, 'nodejs')
})

test('vendor proxy streams data without buffering and keeps private responses no-store', async () => {
  const nativeNext = require('../vendor-portal/node_modules/next/server')
  const upstream = new Response('{"orders":[{"id":"fixture"}]}', { headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': '1000', 'cache-control': 'public' } })
  upstream.arrayBuffer = () => assert.fail('Proxy must not buffer the upstream response')
  const proxy = load('vendor-portal/lib/medusa-proxy.ts', { 'next/server': nativeNext }, {
    Headers, process: { env: { MEDUSA_BACKEND_URL: 'https://backend.example' } },
    fetch: async (url, init) => { assert.equal(url, 'https://backend.example/vendor/orders'); assert.equal(init.cache, 'no-store'); return upstream },
  })
  const result = await proxy.proxyMedusaRequest({ method: 'GET', headers: new Headers(), nextUrl: { search: '' } }, ['vendor', 'orders'])
  assert.match(result.headers.get('cache-control'), /no-store/)
  assert.equal(result.headers.get('content-encoding'), null)
  assert.equal(result.headers.get('content-length'), null)
  assert.equal((await result.json()).orders[0].id, 'fixture')
})
