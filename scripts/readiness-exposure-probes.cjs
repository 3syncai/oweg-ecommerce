// Read-only audit probes: execute source handlers with synthetic dependencies.
// No .env, network, application server, database, S3, or real customer data.
// These record current behavior, not passing security regression expectations.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const backendRequire = createRequire(path.join(root, 'my-medusa-store/package.json'));
function load(relative, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Buffer, URL, process: { env: { DATABASE_URL: 'mock://audit-only' } },
    console: { log() {}, error() {}, warn() {} },
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'zod') return backendRequire('zod');
      throw new Error(`Unmocked dependency: ${name}`);
    },
  }, { filename: relative });
  return exports;
}
function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, setHeader() {} };
}
async function main() {
  const results = [];
  const target = 'vendor_synthetic_target';
  const forged = ['audit', Buffer.from(JSON.stringify({ vendor_id: target })).toString('base64url'), 'unsigned'].join('.');
  const vendor = { id: target, account_no: 'SYNTHETIC-ACCOUNT', pan_no: 'SYNTHETIC-TAX', documents: [] };
  let updateReached = false;
  const service = {
    listVendors: async () => [vendor],
    reapplyVendor: async () => { updateReached = true; return vendor; },
  };
  const req = { headers: { authorization: `Bearer ${forged}` }, scope: { resolve: () => service }, body: { bank_name: 'Synthetic bank' } };
  const vendorMocks = { '../../../../modules/vendor': { VENDOR_MODULE: 'mockVendor' } };
  let res = response();
  await load('my-medusa-store/src/api/store/vendors/me/route.ts', vendorMocks).GET(req, res);
  results.push({ id: 'F21-read', status: res.statusCode, unsigned_token_reads_vendor: res.body?.vendor?.id === target,
    banking_and_tax_fields_returned: Boolean(res.body?.vendor?.account_no && res.body?.vendor?.pan_no) });
  res = response();
  await load('my-medusa-store/src/api/store/vendors/reapply/route.ts', vendorMocks).POST(req, res);
  results.push({ id: 'F21-write', status: res.statusCode, unsigned_token_reaches_reapply_service: updateReached,
    limitation: 'Service is mocked; actual service permits only rejected vendors.' });
  class Client {
    async connect() {}
    async end() {}
    async query() { return { rows: [{ id: 'review_synthetic', reviewer_email: 'audit@example.invalid', customer_id: 'cus_synthetic', status: 'pending' }] }; }
  }
  res = response();
  await load('my-medusa-store/src/api/store/products/[id]/reviews/route.ts', { pg: { Client } }).GET({ params: { id: 'prod_synthetic' } }, res);
  results.push({ id: 'F22', status: res.statusCode, public_review_includes_email_and_customer_id: Boolean(res.body?.reviews?.[0]?.reviewer_email && res.body?.reviews?.[0]?.customer_id),
    public_review_includes_pending: res.body?.reviews?.[0]?.status === 'pending' });
  const next = { NextResponse: { json: (body, init = {}) => ({ status: init.status || 200, body }) } };
  let paymentLookup = false;
  const payment = await load('src/app/api/checkout/razorpay/status/route.ts', {
    'next/server': next, '@/lib/razorpay': { fetchRazorpayPayment: async () => { paymentLookup = true; return { id: 'pay_synthetic', status: 'captured', amount: 100, currency: 'INR' }; } },
  }).GET({ url: 'https://audit.invalid/api/checkout/razorpay/status?paymentId=pay_synthetic' });
  results.push({ id: 'F23', status: payment.status, unauthenticated_payment_lookup: paymentLookup });
  res = response();
  await load('my-medusa-store/src/api/store/flash-sale/debug/route.ts', {
    '../../../../modules/flash-sale': { FLASH_SALE_MODULE: 'mockFlash' },
  }).GET({ scope: { resolve: () => ({ listFlashSaleItems: async () => { throw new Error('Synthetic error only'); } }) } }, res);
  results.push({ id: 'F24', status: res.statusCode, unauthenticated_debug_error_includes_stack: typeof res.body?.stack === 'string' });
  process.stdout.write(JSON.stringify({ date: '2026-10-24', scope: 'Source handlers with mocks only; no hosted exposure or exploitation claim.', results }, null, 2) + '\n');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
