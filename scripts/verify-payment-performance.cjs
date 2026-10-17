/* Request-scoped reuse and capture safety regression tests; no external services. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ts = require('typescript');
const results = [];
function load(file, deps) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, require: name => name in deps ? deps[name] : require(name),
    process: { env: { DATABASE_URL: 'postgres://local-test' } }, console, performance });
  return exports;
}
const next = { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers || {} }) } };
const loaded = { isDraft: false, order: { id: 'order_test', customer_id: 'owner', currency_code: 'inr', metadata: {
  razorpay_order_id: 'gateway_order', razorpay_payment_id: 'gateway_payment', razorpay_amount_minor: 10000,
} } };
async function test(name, run) { await run(); results.push({ name, result: 'PASS' }); console.log('PASS:', name); }
(async () => {
  let orderReads = 0, gatewayReads = 0, writes = 0, amountReads = 0, customerReads = 0;
  let customer = 'owner', captureOk = true;
  class CaptureVerificationError extends Error { constructor(code, status = 409) { super(code); this.code = code; this.status = status; } }
  const access = load('src/lib/checkout-order-access.ts', {
    'next/server': next,
    '@/lib/medusa-auth': { medusaStoreFetch: async () => { customerReads++; return { ok: true, json: async () => ({ customer: { id: customer } }) }; } },
    '@/lib/checkout-order': { loadCheckoutOrder: async () => { orderReads++; return loaded; } },
  });
  const verifier = load('src/lib/verify-checkout-capture.ts', {
    '@/lib/checkout-order': { loadCheckoutOrder: async () => { orderReads++; return loaded; } },
    '@/lib/checkout-payment-snapshot': { loadCheckoutPaymentSnapshot: async () => { throw Error('unnecessary snapshot read'); } },
    '@/lib/razorpay': { fetchRazorpayPayment: async () => { gatewayReads++; return { id: 'gateway_payment', order_id: 'gateway_order', status: captureOk ? 'captured' : 'authorized', amount: 10000, currency: 'INR' }; } },
    '@/lib/medusa-payment': { resolveOrderPayableAmountMinor: async (id, meta) => { amountReads++; assert.equal(id, loaded.order.id); assert.equal(meta, loaded.order.metadata); return meta.razorpay_amount_minor; } },
    '@/lib/payment-capture-validation': load('src/lib/payment-capture-validation.ts', {}),
  });
  let captureInput;
  const route = load('src/app/api/checkout/razorpay/reconcile/route.ts', {
    'next/server': next, '@/lib/checkout-order-access': access, '@/lib/verify-checkout-capture': verifier,
    '@/lib/payment-capture-validation': load('src/lib/payment-capture-validation.ts', {}),
    '@/lib/medusa-payment': { finalizeRazorpayOrderPayment: async input => { writes++; captureInput = input; return { ok: true }; } },
  });
  const request = (cookie = 'oweg_customer_session=qa') => ({ json: async () => ({ medusaOrderId: loaded.order.id }), headers: new Headers(cookie ? { cookie } : {}) });
  await test('anonymous reconciliation performs no order, gateway or accounting work', async () => {
    assert.equal((await route.POST(request(''))).status, 401); assert.equal(orderReads + gatewayReads + writes + customerReads, 0);
  });
  await test('foreign owner is rejected before gateway verification or accounting', async () => {
    customer = 'foreign'; assert.equal((await route.POST(request())).status, 403); assert.equal(gatewayReads + writes, 0); customer = 'owner';
  });
  await test('authorized reconciliation loads order once and still verifies gateway capture', async () => {
    const reads = orderReads; const response = await route.POST(request());
    assert.equal(response.status, 200); assert.equal(orderReads - reads, 1); assert.equal(gatewayReads, 1); assert.equal(amountReads, 1); assert.equal(writes, 1);
    assert.match(response.headers['Server-Timing'], /ownership;dur=.*gateway;dur=.*accounting;dur=/);
    assert.ok(Number.isFinite(Date.parse(captureInput.reconciledAt)));
  });
  await test('unrelated preloaded order is rejected without gateway calls', async () => {
    const before = gatewayReads; await assert.rejects(verifier.verifyCheckoutCapture({ medusaOrderId: 'other', paymentId: 'gateway_payment', gatewayOrderId: 'gateway_order' }, loaded), /payment_order_mismatch/); assert.equal(gatewayReads, before);
  });
  await test('authorized-only payment cannot enter accounting through optimized path', async () => {
    captureOk = false; const before = writes;
    // Invoke verification directly: assertCaptureFacts remains the shared production validator.
    await assert.rejects(verifier.verifyCheckoutCapture({ medusaOrderId: loaded.order.id, paymentId: 'gateway_payment', gatewayOrderId: 'gateway_order' }, loaded));
    assert.equal(writes, before); captureOk = true;
  });
  await test('preloaded order does not bypass amount and currency tampering checks', async () => {
    for (const claim of [{ claimedAmountMinor: 1 }, { claimedCurrency: 'USD' }]) {
      await assert.rejects(verifier.verifyCheckoutCapture({ medusaOrderId: loaded.order.id, paymentId: 'gateway_payment', gatewayOrderId: 'gateway_order', ...claim }, loaded));
    }
  });
  await test('parallel requests each authenticate and load once without sharing customer data', async () => {
    const before = { orderReads, customerReads, gatewayReads, writes };
    const responses = await Promise.all(Array.from({ length: 3 }, () => route.POST(request())));
    assert.ok(responses.every(r => r.status === 200));
    assert.equal(orderReads - before.orderReads, 3); assert.equal(customerReads - before.customerReads, 3); assert.equal(gatewayReads - before.gatewayReads, 3); assert.equal(writes - before.writes, 3);
  });
  let pools = 0, dbReads = 0, ends = 0;
  const payments = load('src/lib/medusa-payment.ts', {
    pg: { Pool: class { constructor() { pools++; } async query(sql) { dbReads++; return { rows: sql.includes('order_summary') ? [{ totals: { current_order_total: 100 } }] : [{ metadata: { razorpay_amount_minor: 10000 } }] }; } async end() { ends++; } } },
    '@/lib/payment-capture-transaction': { recordCaptureAtomically: async () => ({ ok: true }) },
    '@/lib/payment-reliability': { enqueuePaymentWork: async () => {} },
  });
  await test('trusted metadata avoids redundant order query and reuses bounded capture connection pool', async () => {
    assert.equal(await payments.resolveOrderPayableAmountMinor('order_test', loaded.order.metadata), 10000);
    await payments.finalizeRazorpayOrderPayment({ orderId: 'order_test' });
    await payments.finalizeRazorpayOrderPayment({ orderId: 'order_test' });
    assert.equal(pools, 1); assert.equal(dbReads, 0); assert.equal(ends, 0);
  });
  await test('missing preloaded amount falls back to authoritative order summary', async () => {
    assert.equal(await payments.resolveOrderPayableAmountMinor('order_test', {}), 10000); assert.equal(dbReads, 1);
  });
  await test('legacy amount callers still read authoritative metadata', async () => {
    assert.equal(await payments.resolveOrderPayableAmountMinor('order_test'), 10000); assert.equal(dbReads, 2);
  });
  await test('atomic recording failure returns 503 and does not issue a separate metadata write', async () => {
    const failed = load('src/app/api/checkout/razorpay/reconcile/route.ts', {
      'next/server': next, '@/lib/checkout-order-access': access, '@/lib/verify-checkout-capture': verifier,
      '@/lib/payment-capture-validation': { CaptureVerificationError },
      '@/lib/medusa-payment': { finalizeRazorpayOrderPayment: async () => ({ ok: false }) },
      '@/lib/medusa-admin': { updateOrderMetadata: async () => { throw Error('separate metadata write forbidden'); } },
    });
    assert.equal((await failed.POST(request())).status, 503);
  });
  fs.writeFileSync('docs/payment-performance-qa-last-run.json', JSON.stringify({ ranAt: new Date().toISOString(), scope: 'request-scoped call budget and safety; isolated adapters; deployed latency requires redeployment', results }, null, 2) + '\n');
  console.log('Payment performance checks passed:', results.length);
})().catch(error => { console.error(error); process.exitCode = 1; });
