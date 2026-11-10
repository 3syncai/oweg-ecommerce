const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function fixture(env, initialSettings = {}, { draftStatus = 200, sessionStatus = 200 } = {}) {
  const modules = new Map();
  const calls = { pools: 0, queries: [], errors: [], carts: 0, temporaryCarts: 0, drafts: 0, gateway: 0 };
  let settings = initialSettings;
  let tableExists = true;
  let bootstrapError;
  let now = 1_000_000;
  class Pool {
    constructor() { calls.pools++; }
    async query(query) {
      const sql = typeof query === 'string' ? query : query.text;
      calls.queries.push(sql);
      if (sql.includes('CREATE TABLE')) {
        if (bootstrapError) throw bootstrapError;
        tableExists = true;
      }
      if (sql.includes('SELECT value') && !tableExists) throw Object.assign(new Error('Missing table'), { code: '42P01' });
      return { rows: [{ value: settings }] };
    }
  }
  const stubs = {
    'next/headers': {
      headers: async () => new Headers({ cookie: 'mock-session', 'x-guest-cart-id': 'cart_fixture' }),
      cookies: async () => new Map(),
    },
    '@/lib/medusa-admin': {
      readStoreCart: async () => {
        calls.carts++;
        return { cart: { customer_id: 'cus_fixture', region_id: 'reg_fixture', currency_code: 'inr',
          shipping_methods: [{ shipping_option_id: 'so_fixture' }],
          items: [{ variant_id: 'variant_fixture', quantity: 1, unit_price: 199 }],
        } };
      },
      createDraftOrder: async () => {
        calls.drafts++;
        return draftStatus === 200
          ? { ok: true, status: 200, data: { draft_order: { id: 'order_fixture', total: 249 } } }
          : { ok: false, status: draftStatus, data: { message: 'fixture secret', code: 'FIXTURE_UPSTREAM' } };
      },
    },
    '@/lib/medusa-auth': {
      medusaStoreFetch: async () => Response.json({ customer: { id: 'cus_fixture' } }, { status: sessionStatus }),
    },
    '@/lib/checkout-order': {}, '@/lib/medusa-promo': {}, '@/lib/wallet-ledger': {},
    '@/lib/customer-affiliate-coins': {}, '@/lib/payment-reliability': {}, '@/lib/oweg10': {},
    '@/lib/order-discount': { syncOrderTaxInclusivePricing: async () => {} },
    '@/lib/shipping-rules': { calculateStatewiseShipping: () => 50 },
    '@/lib/cart-helpers': { cartLineAmountRupees: () => 199 },
    '@/lib/flash-sale-cart-mapper': { applyFlashSalePricesToCart: cart => cart },
    '@/lib/wallet-policy': { eligibleCoinDiscount: () => 199 },
    '@/lib/razorpay': { createRazorpayOrder: async () => {
      calls.gateway++;
      return { id: 'rzp_fixture', amount: 24900, currency: 'INR' };
    }, getPublicRazorpayKey: () => 'mock-key' },
  };
  function load(file) {
    const name = path.resolve(root, file);
    if (modules.has(name)) return modules.get(name);
    const exports = {};
    modules.set(name, exports);
    const { outputText } = ts.transpileModule(fs.readFileSync(name, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    vm.runInNewContext(outputText, {
      exports, process: { env }, Date: { now: () => now }, Headers,
      fetch: async url => {
        if (url.endsWith('/store/carts')) {
          calls.temporaryCarts++;
          return Response.json({ cart: { id: 'cart_temporary' } });
        }
        if (url.endsWith('/store/carts/cart_temporary/line-items')) {
          return Response.json({ cart: { region_id: 'reg_fixture', currency_code: 'inr',
            shipping_methods: [{ shipping_option_id: 'so_fixture' }],
            items: [{ variant_id: 'variant_fixture', quantity: 1, unit_price: 199 }],
          } });
        }
        if (url.endsWith('/store/flash-sale/products')) return Response.json({});
        if (url.endsWith('/store/catalog-offers/select')) {
          return Response.json({ selections: [{ original_variant_id: 'variant_fixture', variant_id: 'variant_fixture' }] });
        }
        throw new Error('Unexpected upstream request');
      },
      console: { log() {}, error: (...args) => calls.errors.push(args), warn: (...args) => calls.errors.push(args) },
      require(id) {
        if (id === 'pg') return { Pool };
        if (Object.hasOwn(stubs, id)) return stubs[id];
        if (id === 'next/server') return require(id);
        if (id === 'node:crypto') return require(id);
        if (id.startsWith('@/')) return load('src/' + id.slice(2) + '.ts');
        if (id.startsWith('.')) return load(path.resolve(path.dirname(name), id + '.ts'));
        throw new Error('Unexpected dependency: ' + id);
      },
    }, { filename: name });
    return exports;
  }
  return {
    calls,
    publicSettings: load('src/app/api/site-settings/route.ts').GET,
    guard: load('src/lib/debug-controller/guards.ts').getCheckoutGuardResponse,
    draft: (paymentMethod = 'cod', buyNow = false) => load('src/app/api/checkout/draft-order/route.ts').POST({
      json: async () => ({
        shipping: { email: 'fixture@example.invalid', firstName: 'Fixture', address1: 'Fixture Road', postalCode: '400001' },
        customerAffiliateCode: '', paymentMethod,
        ...(buyNow ? { mode: 'buy_now', itemsOverride: [{ variant_id: 'variant_fixture', quantity: 1 }] } : {}),
      }),
    }),
    debugDb: load('src/lib/debug-controller/db.ts'),
    advance: ms => { now += ms; },
    failBootstrap: error => { bootstrapError = error; },
    removeTable: () => { tableExists = false; },
    setSettings: value => { settings = value; },
  };
}

test('production with disabled debug controller and a commerce DB configured still permits checkout', async () => {
  const f = fixture({ NODE_ENV: 'production', DATABASE_URL: 'mock://commerce' });
  assert.equal(await f.guard(), null);
  const response = await f.publicSettings();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).settings.enableCheckout, true);
  assert.equal(f.calls.pools, 0);
  assert.throws(() => f.debugDb.getDebugControllerPool(), /disabled/);
});

test('COD and Razorpay can prepare drafts with the controller disabled', async () => {
  const f = fixture({ NODE_ENV: 'production', DATABASE_URL: 'mock://commerce', MEDUSA_REGION_ID: 'reg_fixture' });
  const cod = await f.draft();
  assert.equal(cod.status, 200);
  assert.equal((await cod.json()).codFast, true);
  assert.equal(f.calls.gateway, 0);
  const online = await f.draft('razorpay', true);
  assert.equal(online.status, 200);
  const onlineDraft = await online.json();
  assert.equal(onlineDraft.draft, true);
  assert.equal(onlineDraft.total, 249);
  assert.equal(f.calls.gateway, 1);
  assert.equal(f.calls.temporaryCarts, 1);
  assert.equal(f.calls.pools, 0);
});

test('maintenance blocks before a cart read or order write', async () => {
  const f = fixture({ NODE_ENV: 'production', ENABLE_DEBUG_CONTROLLER: 'true', DATABASE_URL: 'mock://commerce' }, { siteStatus: 'maintenance' });
  assert.equal((await f.draft()).status, 503);
  assert.equal(f.calls.carts, 0);
  assert.equal(f.calls.drafts, 0);
  assert.equal(f.calls.gateway, 0);
});

test('expired sessions and session outages stop before cart work with distinct status codes', async () => {
  const env = { NODE_ENV: 'production', DATABASE_URL: 'mock://commerce' };
  for (const [sessionStatus, expected] of [[401, 401], [502, 503]]) {
    const f = fixture(env, {}, { sessionStatus });
    assert.equal((await f.draft('razorpay', true)).status, expected);
    assert.equal(f.calls.carts, 0);
    assert.equal(f.calls.drafts, 0);
    assert.equal(f.calls.temporaryCarts, 0);
  }
});

test('Medusa draft failures return a support reference without logging the upstream message or retrying', async () => {
  const f = fixture({ NODE_ENV: 'production', DATABASE_URL: 'mock://commerce' }, {}, { draftStatus: 502 });
  const result = await f.draft('razorpay');
  assert.equal(result.status, 503);
  const body = await result.json();
  assert.match(body.reference, /^[\da-f]{8}-[\da-f]{3}$/);
  assert.equal(f.calls.drafts, 1);
  assert.equal(f.calls.gateway, 0);
  assert.equal(f.calls.errors[0][1].reference, body.reference);
  assert.equal(f.calls.errors[0][1].stage, 'medusa_draft');
  assert.ok(!JSON.stringify([body, f.calls.errors]).includes('fixture secret'));
});

test('enabled controller with only the scoped DB honors maintenance and coalesces concurrent settings reads', async () => {
  const f = fixture({ NODE_ENV: 'production', ENABLE_DEBUG_CONTROLLER: 'true', STOREFRONT_DATABASE_URL: 'mock://scoped' }, { siteStatus: 'maintenance' });
  const results = await Promise.all(Array.from({ length: 25 }, () => f.guard()));
  assert.ok(results.every(response => response?.status === 503));
  assert.equal((await (await f.publicSettings()).json()).settings.siteStatus, 'maintenance');
  assert.equal(f.calls.queries.filter(sql => sql.includes('SELECT value')).length, 1);
  assert.ok(f.calls.queries.every(sql => sql.includes('SELECT value')));
  f.advance(61_000);
  f.setSettings({ siteStatus: 'read_only' });
  assert.equal((await f.guard()).status, 403);
});

test('enabled settings failure is a temporary 503 and a later request can recover', async () => {
  const f = fixture({ NODE_ENV: 'production', ENABLE_DEBUG_CONTROLLER: 'true', DATABASE_URL: 'mock://commerce' });
  f.removeTable();
  f.failBootstrap(Object.assign(new Error('fixture secret'), { code: '08006' }));
  const responses = await Promise.all([f.guard(), f.guard(), f.publicSettings()]);
  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.ok(!(await response.text()).includes('fixture secret'));
  }
  assert.equal(f.calls.queries.length, 2);
  assert.equal(f.calls.errors.length, 1);
  assert.ok(!JSON.stringify(f.calls.errors).includes('fixture secret'));
  assert.equal((await f.guard()).status, 503);
  assert.equal(f.calls.queries.length, 2);
  f.failBootstrap(undefined);
  f.advance(3_001);
  assert.equal(await f.guard(), null);
  assert.equal((await f.publicSettings()).status, 200);
});
