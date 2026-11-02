// Isolated contracts: deliberately no environment loading, database or gateway access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, require: name => {
    if (!(name in deps)) throw Error('Unexpected dependency: ' + name);
    return deps[name];
  } });
  return exports;
}
const state = load('src/lib/checkout-confirmation.ts');
const order = { id: 'order_qa', status: 'pending', payment_status: 'captured', is_draft_order: false, metadata: {} };
test('capture alone never confirms a draft, cancelled or suppressed order', () => {
  for (const override of [{ is_draft_order: true }, { status: 'draft' }, { status: 'canceled' }, { status: 'cancelled' }, { metadata: { checkout_duplicate_suppressed: true } }]) {
    assert.equal(state.checkoutConfirmationState({ ...order, ...override }).complete, false);
  }
  assert.equal(state.checkoutConfirmationState(null).complete, false);
  assert.equal(state.checkoutConfirmationState(order).complete, true);
});
test('COD needs persisted confirmation and placement; online uses persisted capture', () => {
  const cod = { ...order, payment_status: 'cod', metadata: { payment_method: 'cod' } };
  assert.equal(state.checkoutConfirmationState(cod).complete, false);
  assert.equal(state.checkoutConfirmationState({ ...cod, metadata: { ...cod.metadata, cod_status: 'confirmed' } }).complete, true);
  assert.equal(state.checkoutConfirmationState({ ...order, payment_status: 'authorized' }).complete, false);
  assert.equal(state.checkoutConfirmationState({ ...order, payment_status: 'awaiting', metadata: { razorpay_payment_status: 'captured' } }).complete, true);
});
const next = { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status || 200, headers: opts.headers || {} }) } };
test('status route preserves ownership errors, validates ID, and exposes no private order data', async () => {
  let reads = 0, denial = null;
  const route = load('src/app/api/checkout/confirmation-status/route.ts', {
    'next/server': next,
    '@/lib/checkout-order-access': { loadAuthorizedCheckoutOrder: async () => {
      reads++;
      return { error: denial, loaded: { isDraft: false, order: { ...order, email: 'private', items: [{ secret: true }], metadata: { razorpay_payment_status: 'captured', razorpay_signature: 'secret' } } } };
    } },
  });
  assert.equal((await route.GET({ url: 'http://qa/status' })).status, 400);
  assert.equal(reads, 0);
  for (const status of [401, 403, 404, 503]) {
    denial = { status };
    assert.equal((await route.GET({ url: 'http://qa/status?orderId=order_qa' })).status, status);
  }
  denial = null;
  const result = await route.GET({ url: 'http://qa/status?orderId=order_qa' });
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.equal(result.body.order.metadata.razorpay_payment_status, 'captured');
  assert(!JSON.stringify(result.body).includes('secret'));
  assert(!JSON.stringify(result.body).includes('private'));
  assert.equal(reads, 5);
});
test('summary reuses its authorized order instead of loading it twice', async () => {
  let reads = 0, enrichments = 0;
  const route = load('src/app/api/checkout/order-summary/route.ts', {
    'next/server': next,
    '@/lib/checkout-order-access': { loadAuthorizedCheckoutOrder: async () => { reads++; return { error: null, loaded: { isDraft: false, order } }; } },
    '@/lib/medusa-admin': {}, '@/lib/shipping-rules': {},
    '@/lib/order-display-totals': { enrichOrderWithSummaryTotals: async o => { enrichments++; return o; }, normalizeOrderForCustomer: o => ({ ...o, display_totals: { grandTotal: 123.45 } }) },
  });
  const response = await route.GET({ url: 'http://qa/summary?orderId=order_qa' });
  assert.equal(response.body.order.total, 123.45);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(reads, 1); assert.equal(enrichments, 1);
});
test('adaptive schedule reduces 30-second polling without delaying the first check', () => {
  let elapsed = 0, requests = 0;
  while ((elapsed += state.confirmationPollDelay(requests)) <= 30000) requests++;
  assert.equal(state.confirmationPollDelay(0), 1000);
  assert(requests <= 10);
  console.log(`30-second pending window: old 30 polls, new ${requests} polls (sequential, zero network latency model)`);
});
