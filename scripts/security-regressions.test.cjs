const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

// Execute real handlers against mocked upstream/session/database boundaries.
// No .env loading, network requests, live database or provider calls.
function harness({ signedIn = false, sessionFailure = false, sessionId = 'cus_owner', existingCode = null, registered = true } = {}) {
  const calls = { queries: [], cacheReads: 0, upstream: [], releases: 0, admin: [] };
  const env = { DATABASE_URL: 'mock://isolated', INTERNAL_API_SECRET: 'fixture-internal-secret' };
  let savedCode = existingCode;
  const customer = { id: sessionId, email: 'owner@example.invalid', first_name: 'Verified', last_name: 'Customer' };
  const query = async (sql, params = []) => {
    calls.queries.push({ sql, params });
    if (sql.includes('SELECT referral_code FROM customer_referral')) return { rows: savedCode ? [{ referral_code: savedCode }] : [] };
    if (sql.includes('INSERT INTO customer_referral ')) savedCode = params[1];
    if (sql.includes('SELECT 1 FROM affiliate_user')) return { rows: [] };
    if (sql.includes('FROM affiliate_user') || sql.includes('UNION SELECT')) return { rows: [{ id: 'agent_1' }] };
    if (sql.includes('SELECT email, first_name')) return { rows: [customer] };
    if (sql.includes('FROM customer_referrer') && !sql.includes('coins_log') && !sql.includes('referrals')) return { rows: registered ? [{ id: 'ref_1', customer_id: sql.includes('UPPER(refer_code)') ? 'cus_affiliate' : sessionId, refer_code: 'AFF', is_active: true, earned_coins: 0, pending_coins: 0 }] : [] };
    if (sql.includes('INSERT INTO customer_referrer ')) return { rows: [{ id: 'ref_new', customer_id: sessionId, refer_code: params[1], earned_coins: 0, pending_coins: 0 }] };
    if (sql.includes('COUNT(*) as total')) return { rows: [{ total: 0 }] };
    return { rows: [] };
  };
  const client = { query, release: () => calls.releases++ };
  class Pool { query = query; async end() {} }
  const next = { NextResponse: { json: (body, init = {}) => ({ status: init.status || 200, body }) } };
  const modules = new Map();
  const stubs = {
    'next/server': next,
    pg: { Pool },
    '@/lib/medusa-auth': { medusaStoreFetch: async (url, options) => {
      calls.upstream.push({ url, options });
      if (sessionFailure) throw new Error('mock upstream failure');
      return { ok: signedIn, json: async () => ({ customer }) };
    } },
    '@/lib/affiliate-pg': { query, getAffiliatePool: () => ({ connect: async () => client }) },
    '@/lib/affiliate-cache': { cacheGet: () => { calls.cacheReads++; return null; }, cacheSet() {}, invalidate() {} },
    '@/lib/medusa-admin': { adminFetch: async (...args) => { calls.admin.push(args); return { ok: true, data: { customer: { metadata: {} } } }; } },
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      exports, process: { env }, Buffer, Headers, URL, console: { log() {}, warn() {}, error() {} },
      require: name => {
        if (Object.hasOwn(stubs, name)) return stubs[name];
        if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts');
        return require(name);
      },
    }, { filename: file });
    return exports;
  }
  const request = ({ headers = {}, body = {}, search = '' } = {}) => ({
    headers: new Headers({ ...(signedIn || sessionFailure ? { cookie: 'oweg_store_session=fixture' } : {}), ...headers }),
    json: async () => body,
    url: 'https://fixture.invalid/' + search,
    nextUrl: new URL('https://fixture.invalid/' + search),
  });
  return { load, request, calls, env };
}

const privateRoutes = [
  ['customer-affiliate/me', 'GET'], ['customer-affiliate/stats', 'GET'],
  ['store/referral-code', 'GET'], ['customer-affiliate/register', 'POST'],
  ['customer-affiliate/track-referral', 'POST'], ['store/save-referral', 'POST'],
  ['affiliate/referrals', 'POST'],
];
for (const [route, method] of privateRoutes) {
  test(`${route}: a supplied victim ID without a session never reaches data`, async () => {
    const h = harness();
    const result = await h.load(`src/app/api/${route}/route.ts`)[method](h.request({
      headers: { 'x-customer-id': 'cus_victim' },
      body: { customer_id: 'cus_victim', referred_customer_id: 'cus_victim', referral_code: 'AFF', refer_code: 'AFF' },
    }));
    assert.equal(result.status, 401);
    assert.equal(h.calls.queries.length, 0);
    assert.equal(h.calls.cacheReads, 0);
  });
  test(`${route}: a real session cannot target another customer`, async () => {
    const h = harness({ signedIn: true });
    const result = await h.load(`src/app/api/${route}/route.ts`)[method](h.request({
      headers: { 'x-customer-id': 'cus_victim' },
      body: { customer_id: 'cus_victim', referred_customer_id: 'cus_victim', referral_code: 'AFF', refer_code: 'AFF' },
    }));
    assert.equal(result.status, 403);
    assert.equal(h.calls.queries.length, 0);
  });
}
for (const route of ['customer-affiliate/register', 'store/save-referral', 'affiliate/referrals', 'customer-affiliate/track-referral']) {
  test(`${route}: body-only identity spoofing is rejected`, async () => {
    const h = harness({ signedIn: true });
    const result = await h.load(`src/app/api/${route}/route.ts`).POST(h.request({
      body: { customer_id: 'cus_victim', referred_customer_id: 'cus_victim', referral_code: 'AFF', refer_code: 'AFF' },
    }));
    assert.equal(result.status, 403);
    assert.equal(h.calls.queries.length, 0);
  });
}
test('session lookup failure fails closed before querying referral data', async () => {
  const h = harness({ sessionFailure: true });
  const response = await h.load('src/app/api/customer-affiliate/me/route.ts').GET(h.request());
  assert.equal(response.status, 503);
  assert.equal(h.calls.queries.length, 0);
});
test('authenticated reads derive identity from upstream customer session, without an ID header', async () => {
  const h = harness({ signedIn: true });
  const response = await h.load('src/app/api/customer-affiliate/me/route.ts').GET(h.request());
  assert.equal(response.status, 200);
  assert.equal(h.calls.queries[0].params[0], 'cus_owner');
  assert.equal(h.calls.upstream[0].url, '/store/customers/me');
  assert.match(h.calls.upstream[0].options.forwardedCookie, /oweg_store_session=/);
});
test('customer validation remains public for generic codes but protects redemption history', async () => {
  const h = harness();
  const handler = h.load('src/app/api/customer-affiliate/validate/route.ts');
  assert.equal((await handler.GET(h.request({ search: '?code=AFF&customer_id=cus_victim' }))).status, 401);
  assert.equal(h.calls.queries.length, 0);
  const response = await handler.GET(h.request({ search: '?code=AFF' }));
  assert.equal(response.status, 200);
  assert.equal(response.body.valid, true);
  assert.equal(h.calls.queries.some(call => call.sql.includes('coins_log')), false);
});
test('signed-in validation cannot use another customer query parameter', async () => {
  const h = harness({ signedIn: true });
  const result = await h.load('src/app/api/customer-affiliate/validate/route.ts').GET(h.request({ search: '?code=AFF&customer_id=cus_victim' }));
  assert.equal(result.status, 403);
  assert.equal(h.calls.queries.length, 0);
});
for (const route of ['affiliate/stats', 'affiliate/referrals']) {
  test(`${route}: public codes and customer sessions do not authenticate agent reads`, async () => {
    const h = harness({ signedIn: true });
    const result = await h.load(`src/app/api/${route}/route.ts`).GET(h.request({ headers: { 'x-affiliate-code': 'AFF' } }));
    assert.equal(result.status, 401);
    assert.equal(h.calls.queries.length, 0);
  });
}
test('legacy agent read with a valid server credential can use its scoped code', async () => {
  const h = harness();
  const result = await h.load('src/app/api/affiliate/referrals/route.ts').GET(h.request({ headers: { 'x-affiliate-code': 'AFF', 'x-internal-api-secret': h.env.INTERNAL_API_SECRET } }));
  assert.equal(result.status, 200);
  assert.equal(h.calls.queries.every(call => call.params[0] === 'AFF'), true);
});
test('referral registration uses the verified session profile instead of body fields', async () => {
  const h = harness({ signedIn: true, registered: false });
  const result = await h.load('src/app/api/customer-affiliate/register/route.ts').POST(h.request({ body: { email: 'spoof@example.invalid', name: 'Spoofed' } }));
  assert.equal(result.status, 200);
  const insert = h.calls.queries.find(call => call.sql.includes('INSERT INTO customer_referrer '));
  assert.ok(insert);
  assert.equal(insert.params[0], 'cus_owner');
  assert.equal(insert.params[2], 'owner@example.invalid');
  assert.equal(insert.params[3], 'Verified Customer');
});
test('saving a referral serializes ownership and commits both attribution writes', async () => {
  const h = harness({ signedIn: true });
  const result = await h.load('src/app/api/store/save-referral/route.ts').POST(h.request({ body: { referral_code: 'aff' } }));
  assert.equal(result.status, 200);
  assert.equal(h.calls.queries[0].sql, 'BEGIN');
  assert.match(h.calls.queries[1].sql, /pg_advisory_xact_lock/);
  assert.equal(h.calls.queries[1].params[0], 'cus_owner');
  const writes = h.calls.queries.filter(call => call.sql.includes('INSERT INTO'));
  assert.equal(writes.length, 2);
  assert.equal(writes[0].params[0], 'cus_owner');
  assert.equal(writes[1].params[2], 'cus_owner');
  assert.equal(h.calls.queries.at(-1).sql, 'COMMIT');
  assert.equal(h.calls.releases, 1);
});
test('locked referrals cannot be replaced, and no metadata sync runs after a rejected change', async () => {
  const h = harness({ signedIn: true, existingCode: 'LOCKED' });
  const result = await h.load('src/app/api/store/save-referral/route.ts').POST(h.request({ body: { referral_code: 'OTHER' } }));
  assert.equal(result.status, 409);
  assert.equal(h.calls.queries.at(-1).sql, 'ROLLBACK');
  assert.equal(h.calls.queries.some(call => call.sql.includes('INSERT INTO')), false);
  assert.equal(h.calls.admin.length, 0);
  assert.equal(h.calls.releases, 1);
});

function isolated(file, env, overrides = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, process: { env }, Buffer, console, require: name => Object.hasOwn(overrides, name) ? overrides[name] : name.startsWith('node:') || name === 'crypto' ? require(name) : {} });
  return exports;
}
for (const value of [undefined, '', '   ', 'oweg-debug-4719-change-me', 'Test@123']) {
  test(`vendor debug rejects missing/weak production configuration (${JSON.stringify(value)})`, () => {
    const auth = isolated('vendor-portal/lib/debug-controller/auth.ts', { NODE_ENV: 'production', DEBUG_CONTROLLER_SECRET: value });
    assert.throws(() => auth.assertDebugControllerSecretForProduction());
    assert.throws(() => auth.getDebugControllerSecret());
  });
}
test('vendor debug accepts a configured secret and rejects an incorrect token', () => {
  const auth = isolated('vendor-portal/lib/debug-controller/auth.ts', { NODE_ENV: 'production', DEBUG_CONTROLLER_SECRET: 'fixture-unique-controller-secret' });
  auth.assertDebugControllerSecretForProduction();
  assert.equal(auth.verifyDebugControllerToken('fixture-unique-controller-secret'), true);
  assert.equal(auth.verifyDebugControllerToken('wrong'), false);
});
test('vendor production secret can use the supported token variable; dev fallback remains dev-only', () => {
  const auth = isolated('vendor-portal/lib/debug-controller/auth.ts', { NODE_ENV: 'production', DEBUG_CONTROLLER_TOKEN: 'fixture-token-secret' });
  assert.equal(auth.verifyDebugControllerToken('fixture-token-secret'), true);
  const dev = isolated('vendor-portal/lib/debug-controller/auth.ts', { NODE_ENV: 'development' });
  assert.equal(typeof dev.getDebugControllerSecret(), 'string');
});
for (const provider of ['itl', 'shiprocket']) {
  const title = provider === 'itl' ? 'Itl' : 'Shiprocket';
  test(`${provider}: valid credentials and legacy header names work, invalid/array headers fail`, () => {
    const env = { [provider.toUpperCase() + '_WEBHOOK_SECRET']: 'fixture-shipping-secret' };
    const auth = isolated('my-medusa-store/src/lib/shipping-webhook-auth.ts', env);
    for (const key of ['x-api-key', `x-${provider}-webhook-secret`, `x-${provider}-signature`]) {
      assert.equal(auth.shippingWebhookAuthError({ headers: { [key]: 'fixture-shipping-secret' } }, provider), null);
    }
    for (const headers of [{}, { 'x-api-key': 'wrong' }, { 'x-api-key': ['fixture-shipping-secret'] }]) {
      assert.equal(auth.shippingWebhookAuthError({ headers }, provider).status, 401);
    }
  });
  for (const value of [undefined, '', '   ']) {
    test(`${provider}: missing/blank secret returns 503 before resolving services`, async () => {
      const env = { [provider.toUpperCase() + '_WEBHOOK_SECRET']: value };
      const auth = isolated('my-medusa-store/src/lib/shipping-webhook-auth.ts', env);
      const handler = isolated(`my-medusa-store/src/api/custom/${provider}/webhook/handler.ts`, env, { '../../../../lib/shipping-webhook-auth': auth });
      let status;
      const res = { status(code) { status = code; return this; }, json(body) { return body; } };
      await handler[`handle${title}Webhook`]({ headers: {} }, res);
      assert.equal(status, 503);
      assert.equal(handler[`verify${title}WebhookSecret`]({ headers: {} }), false);
    });
  }
  test(`${provider}: wrong secret returns 401 before touching shipment state`, async () => {
    const env = { [provider.toUpperCase() + '_WEBHOOK_SECRET']: 'fixture-shipping-secret' };
    const auth = isolated('my-medusa-store/src/lib/shipping-webhook-auth.ts', env);
    const handler = isolated(`my-medusa-store/src/api/custom/${provider}/webhook/handler.ts`, env, { '../../../../lib/shipping-webhook-auth': auth });
    let status;
    const res = { status(code) { status = code; return this; }, json(body) { return body; } };
    await handler[`handle${title}Webhook`]({ headers: { 'x-api-key': 'wrong' } }, res);
    assert.equal(status, 401);
  });
}
