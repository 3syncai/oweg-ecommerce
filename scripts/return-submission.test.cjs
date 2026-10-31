const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const filename = path.resolve(file), module = { exports: {} }, local = createRequire(filename);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, Date, Map, Set, console: { log() {}, error() {} },
    process: { env: {} }, require: key => key in mocks ? mocks[key] : local(key), ...globals }, { filename });
  return module.exports;
}
const validators = load('my-medusa-store/src/api/store/return-requests/validators.ts');
const { returnPayoutError } = load('src/lib/return-payout-validation.ts');
const base = { order_id: 'order_test', type: 'return', reason: 'Quality issue',
  items: [{ order_item_id: 'item_test', quantity: 1 }], images: [] };
const bank = { account_name: 'Test Customer', account_number: '1234567890', ifsc_code: 'ABCD0123456', bank_name: 'Test Bank' };

test('bank and UPI validation matches the backend, including the short IFSC from the recording', () => {
  for (const [method, upi, details, expected] of [
    ['bank', '', bank, true], ['bank', '', { ...bank, ifsc_code: 'ICIC001569' }, false],
    ['bank', '', { ...bank, account_number: '12345' }, false],
    ['bank', '', { ...bank, account_number: '123456X' }, false],
    ['bank', '', { ...bank, account_name: '   ' }, false],
    ['bank', '', { ...bank, ifsc_code: ' abcd0123456 ', account_number: ' 1234567890 ' }, true],
    ['upi', 'customer@sbi', bank, true], ['upi', 'customer', bank, false],
    ['upi', 'x'.repeat(121) + '@sbi', bank, false],
  ]) {
    const refund_payout = method === 'bank' ? { method, ...details } : { method, upi_id: upi };
    assert.equal(validators.StoreCreateReturnRequest.safeParse({ ...base, refund_payout }).success, expected);
    assert.equal(returnPayoutError(method, upi, details) === null, expected);
  }
  const parsed = validators.StoreCreateReturnRequest.safeParse({ ...base, refund_payout: { method: 'bank', ...bank, ifsc_code: 'ICIC001569' } });
  assert.match(parsed.error.issues[0].message, /11-character IFSC/);
  assert.doesNotMatch(parsed.error.issues[0].message, /String must/);
  assert.equal(validators.StoreCreateReturnRequest.safeParse({ ...base, type: 'replacement' }).success, true);
});

function fixture({ type = 'return', otherCustomer = false, expired = false, invalidItem = false, windowDays = 7, metadataFails = false } = {}) {
  const writes = [], policies = [];
  const knex = require('./../my-medusa-store/node_modules/knex')({ client: 'pg' });
  const queries = [];
  const connection = table => {
    const builder = knex(table);
    // Real Knex SQL generation catches column-name mistakes without using a database.
    builder.then = (resolve, reject) => {
      queries.push(builder.toSQL().sql);
      if (table === 'product_category_product') {
        assert.match(queries.at(-1), /"product_category_id" as "category_id"/);
        return Promise.resolve([{ product_id: 'prod_test', category_id: 'cat_test' }]).then(resolve, reject);
      }
      return Promise.resolve([{ variant_id: 'variant_test', product_id: 'prod_test' }]).then(resolve, reject);
    };
    return builder;
  };
  class MedusaError extends Error { constructor(type, message) { super(message); this.type = type; } }
  const route = load('my-medusa-store/src/api/store/return-requests/route.ts', {
    '@medusajs/framework/utils': { MedusaError, MedusaErrorTypes: { UNAUTHORIZED: 'unauthorized', INVALID_DATA: 'invalid_data' }, Modules: { ORDER: 'order' } },
    pg: { Pool: class { async end() {} } },
    '../../../lib/vendor-return-policy': { resolveReturnPolicyForProduct: async (_, categories) => { policies.push(categories); return { return_window_days: windowDays, replacement_window_days: windowDays }; } },
    '../../../modules/returns': { RETURN_MODULE: 'returns' },
    './validators': validators,
    '../../../lib/return-images': { validateReturnImages() {}, async verifyStoredReturnImages() {}, returnImageViews() {} },
    '../../../services/return-bank-crypto': { ReturnRefundConfigurationError: class extends Error {} },
    '../../../services/sync-order-return-metadata': { syncOrderReturnMetadata: async () => { if (metadataFails) throw Error('offline'); } },
    '../../../lib/vendor-earnings': {},
  });
  const req = { auth_context: { actor_id: 'customer_test' }, body: { ...base, type,
    items: [{ order_item_id: invalidItem ? 'other_item' : 'item_test', quantity: 1 }],
    ...(type === 'return' ? { refund_payout: { method: 'upi', upi_id: 'customer@sbi' } } : {}) },
    scope: { resolve: key => ({
      order: { retrieveOrder: async () => ({ id: 'order_test', customer_id: otherCustomer ? 'other' : 'customer_test',
        metadata: { shiprocket_delivered_at: new Date(Date.now() - (expired ? 9 : 1) * 86400000).toISOString() },
        items: [{ id: 'item_test', variant_id: 'variant_test', quantity: 2 }] }) },
      returns: { createReturnRequest: async input => { writes.push(input); return { ...input, id: 'return_test', status: 'pending_approval', bank_details_encrypted: 'private-test-value' }; } },
      __pg_connection__: connection,
    })[key] } };
  const res = { status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
  return { route, req, res, writes, policies, queries };
}

for (const type of ['return', 'replacement']) {
  test(`${type} resolves real category column, preserves policy and saves one pending request`, async () => {
    const f = fixture({ type }); await f.route.POST(f.req, f.res);
    assert.equal(f.res.statusCode, 200); assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].type, type); assert.equal(f.policies[0][0], 'cat_test');
    assert.equal(f.res.data.return_request.bank_details_encrypted, undefined);
    assert.equal(f.res.data.return_request.status, 'pending_approval');
  });
}
test('valid bank return forwards payout and optional photos without changing their values', async () => {
  const f = fixture(); f.req.body.refund_payout = { method: 'bank', ...bank };
  f.req.body.images = [{ order_item_id: 'item_test', key: 'test-photo-key' }];
  await f.route.POST(f.req, f.res);
  assert.equal(f.res.statusCode, 200); assert.equal(f.writes[0].refund_payout.account_number, bank.account_number);
  assert.equal(f.writes[0].images[0].key, 'test-photo-key');
});
test('ownership, item quantities, policy prohibition and expiry still reject before any write', async () => {
  for (const options of [{ otherCustomer: true }, { invalidItem: true }, { expired: true }, { windowDays: 0 }]) {
    const f = fixture(options); await assert.rejects(f.route.POST(f.req, f.res)); assert.equal(f.writes.length, 0);
  }
  const f = fixture(); f.req.body.items[0].quantity = 3;
  await assert.rejects(f.route.POST(f.req, f.res), /quantity/); assert.equal(f.writes.length, 0);
});
test('invalid IFSC gets a readable server error before order retrieval or saving', async () => {
  const f = fixture(); f.req.body.refund_payout = { method: 'bank', ...bank, ifsc_code: 'ICIC001569' };
  await f.route.POST(f.req, f.res); assert.equal(f.res.statusCode, 400);
  assert.match(f.res.data.message, /11-character IFSC/); assert.equal(f.writes.length, 0);
});
test('metadata sync failure after saving does not incorrectly report submission failure', async () => {
  const f = fixture({ metadataFails: true }); await f.route.POST(f.req, f.res);
  assert.equal(f.res.statusCode, 200); assert.equal(f.writes.length, 1);
});
test('old rewards order URLs redirect to the implemented account detail route', async () => {
  let target;
  const route = load('src/app/order/details/[id]/page.tsx', { 'next/navigation': { redirect: url => { target = url; } } });
  await route.default({ params: Promise.resolve({ id: 'order_test' }) });
  assert.equal(target, '/account/orders/order_test');
  const rewards = fs.readFileSync('src/app/my-reward/page.tsx', 'utf8');
  assert.match(rewards, /\/account\/orders\/\$\{encodeURIComponent\(tx.order_id\)\}/);
  assert.doesNotMatch(rewards, /\/order\/details\//);
});

function customerForm() {
  const states = [], requests = [];
  let index = 0;
  const react = {
    useState(initial) {
      const slot = index++;
      if (!(slot in states)) states[slot] = slot === 0 ? { id: 'order_test', items: [] } : initial;
      return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
    },
    useMemo: fn => fn(), useCallback: fn => fn, useRef: value => ({ current: value }), useEffect() {},
  };
  const { useOrderDetail } = load('src/hooks/useOrderDetail.ts', {
    react,
    '@/contexts/AuthProvider': { useAuth: () => ({ customer: { id: 'customer_test' }, refresh() {} }) },
    '@/components/orders/CancelOrderPanel': { CANCELLATION_REASONS: [] },
    '@/lib/order-tracker': new Proxy({}, { get: () => () => null }),
    '@/lib/order-utils': { sanitizeTextInput: value => value.trim() },
    '@/lib/return-payout-validation': { returnPayoutError },
  }, { fetch: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, json: async () => ({ return_requests: [] }) };
  } });
  const render = () => { index = 0; return useOrderDetail('order_test'); };
  let form = render();
  form.setReturnItems([{ order_item_id: 'item_test', quantity: 1, max: 2, selected: true }]);
  form.setReturnReason('Quality issue');
  form = render();
  return { render, requests, form };
}
test('customer form blocks invalid IFSC before uploads or submission and shows a specific error', async () => {
  const f = customerForm(); f.form.setPayoutMethod('bank');
  f.form.setBankDetails({ ...bank, ifsc_code: 'ICIC001569' });
  await f.render().submitReturnRequest();
  assert.match(f.render().returnError, /11-character IFSC/); assert.equal(f.requests.length, 0);
});
test('customer bank submission trims fields, normalizes IFSC and refreshes requests after success', async () => {
  const f = customerForm(); f.form.setPayoutMethod('bank');
  f.form.setBankDetails({ account_name: ' Test Customer ', account_number: ' 1234567890 ', ifsc_code: ' abcd0123456 ', bank_name: ' Test Bank ' });
  await f.render().submitReturnRequest();
  const body = JSON.parse(f.requests[0].options.body);
  assert.equal(body.refund_payout.ifsc_code, bank.ifsc_code);
  assert.equal(body.refund_payout.account_number, bank.account_number);
  assert.equal(f.requests[1].url, '/api/medusa/return-requests');
  assert.match(f.render().returnSuccess, /^Return request submitted/);
});
test('replacement ignores stale payout fields and reports replacement success', async () => {
  const f = customerForm(); f.form.setReturnType('replacement');
  f.form.setPayoutMethod('bank'); f.form.setBankDetails({ ...bank, ifsc_code: 'invalid' });
  await f.render().submitReturnRequest();
  const body = JSON.parse(f.requests[0].options.body);
  assert.equal(body.type, 'replacement'); assert.equal(body.refund_payout, undefined);
  assert.match(f.render().returnSuccess, /^Replacement request submitted/);
});
