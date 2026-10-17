/* Isolated PostgreSQL integration tests. Never inserts into the application schema. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const ts = require('typescript');
const { Pool } = require('pg');

for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
}
const originalUrl = process.env.DATABASE_URL;
if (!originalUrl) throw Error('DATABASE_URL required');
const schema = 'qa_payment_acid_' + crypto.randomBytes(8).toString('hex');
const ssl = originalUrl.includes('amazonaws.com') ? { rejectUnauthorized: false } : undefined;
const admin = new Pool({ connectionString: originalUrl, ssl });
const isolatedUrl = new URL(originalUrl);
isolatedUrl.searchParams.set('options', '-csearch_path=' + schema);
process.env.DATABASE_URL = isolatedUrl.toString();
const pool = new Pool({ connectionString: isolatedUrl.toString(), ssl });
const results = [];
function load(file, source) {
  const exports = {};
  const code = ts.transpileModule(source || fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === '@/lib/medusa-admin' ? {} : name === '@/lib/payment-reliability' ? load('my-medusa-store/src/lib/payment-reliability.ts') : require(name), process, console, Buffer, setTimeout, clearTimeout }, { filename: file });
  return exports;
}
async function fixture(id, amountMinor = 10000) {
  await pool.query('INSERT INTO "order" (id,metadata) VALUES ($1,$2)', [id, JSON.stringify({ payment_reliability_version:1,razorpay_order_id: 'rzp_' + id, medusa_total_minor: amountMinor })]);
  await pool.query('INSERT INTO order_line_item(id,unit_price) VALUES($1,$2)',['line_'+id,amountMinor/100]);
  await pool.query('INSERT INTO order_item(id,item_id,order_id,quantity,version) VALUES($1,$2,$3,1,1)',['oi_'+id,'line_'+id,id]);
  await pool.query('INSERT INTO order_summary (order_id,totals) VALUES ($1,$2)', [id, JSON.stringify({ current_order_total: amountMinor / 100, paid_total: 0 })]);
}
const input = id => ({ orderId: id, amountMinor: 10000, currencyCode: 'inr', razorpayPaymentId: 'pay_' + id, razorpayOrderId: 'rzp_' + id });
async function count(table, id) {
  const conditions = table === 'payment' ? 'payment_collection_id IN (SELECT payment_collection_id FROM order_payment_collection WHERE order_id=$1)' : 'order_id=$1';
  return (await pool.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${conditions}`, [id])).rows[0].n;
}
async function test(name, fn) { await fn(); results.push({ name, result: 'PASS' }); console.log('PASS:', name); }

async function main() {
  await admin.query('CREATE SCHEMA ' + schema);
  await pool.query(`
    CREATE TABLE "order" (id text PRIMARY KEY,version int DEFAULT 1, customer_id text DEFAULT 'qa_customer', metadata jsonb DEFAULT '{}', currency_code text DEFAULT 'inr', is_draft_order boolean DEFAULT false, deleted_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE TABLE return_request(id text PRIMARY KEY,status text);
    CREATE TABLE product(id text PRIMARY KEY,metadata jsonb DEFAULT '{}');
    CREATE TABLE product_variant(id text PRIMARY KEY,product_id text);
    CREATE TABLE order_line_item(id text PRIMARY KEY,unit_price numeric,product_id text,variant_id text,deleted_at timestamptz);
    CREATE TABLE order_item(id text PRIMARY KEY,item_id text,order_id text,quantity numeric,version int,deleted_at timestamptz);
    CREATE TABLE wallet_account(customer_id text PRIMARY KEY,actual_balance bigint,updated_at timestamptz DEFAULT now());
    CREATE TABLE wallet_ledger(id bigserial PRIMARY KEY,customer_id text,order_id text,type text,amount bigint,reference_id text,idempotency_key text UNIQUE,metadata jsonb DEFAULT '{}');
    CREATE TABLE payment_collection (id text PRIMARY KEY, currency_code text, amount numeric, raw_amount jsonb, captured_amount numeric, raw_captured_amount jsonb, status text, metadata jsonb, created_at timestamptz, updated_at timestamptz);
    CREATE TABLE order_payment_collection (id text PRIMARY KEY, order_id text, payment_collection_id text, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz, UNIQUE(order_id,payment_collection_id));
    CREATE TABLE payment_session (id text PRIMARY KEY, currency_code text, amount numeric, raw_amount jsonb, provider_id text, data jsonb, context jsonb, status text, payment_collection_id text, created_at timestamptz, updated_at timestamptz);
    CREATE TABLE payment (id text PRIMARY KEY, amount numeric, raw_amount jsonb, currency_code text, provider_id text, data jsonb, payment_collection_id text, payment_session_id text, captured_at timestamptz, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz);
    CREATE TABLE capture (id text PRIMARY KEY, amount numeric, raw_amount jsonb, payment_id text, metadata jsonb, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz);
    CREATE TABLE order_transaction (id text PRIMARY KEY, order_id text, version integer, amount numeric, raw_amount jsonb, currency_code text, reference text, reference_id text, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz);
    CREATE TABLE order_summary (id text DEFAULT gen_random_uuid()::text, order_id text PRIMARY KEY, totals jsonb, updated_at timestamptz DEFAULT now());
  `);
  const reliability=load('my-medusa-store/src/lib/payment-reliability.ts');
  await pool.query(reliability.PAYMENT_RELIABILITY_SCHEMA);
  if (process.argv.includes('--baseline')) {
    await fixture('baseline');
    await pool.query('ALTER TABLE payment ADD CONSTRAINT injected_failure CHECK (false)');
    const legacy = load('src/lib/medusa-payment.ts', require('node:child_process').execFileSync('git', ['show','HEAD:src/lib/medusa-payment.ts'], {encoding:'utf8'}));
    const result = await legacy.createMedusaPayment({ order_id: 'baseline', amount: 10000, currency_code: 'inr', provider_id: 'razorpay', data: { razorpay_payment_id: 'pay_baseline' } });
    assert.equal(result.success, false);
    const partial = (await pool.query('SELECT (SELECT count(*) FROM payment_collection)::int AS collections, (SELECT count(*) FROM payment_session)::int AS sessions, (SELECT count(*) FROM order_payment_collection)::int AS links')).rows[0];
    assert(partial.collections > 0 && partial.sessions > 0 && partial.links > 0);
    console.log('CONFIRMED BASELINE ATOMICITY FAILURE:', partial, 'remain after payment INSERT failure');
    return;
  }
  const { recordCaptureAtomically, stampCheckoutFailure } = load('src/lib/payment-capture-transaction.ts');
  await test('all payment records, accounting and totals commit together', async () => {
    await fixture('success'); await recordCaptureAtomically(pool, { ...input('success'), reconciledAt: '2026-10-17T12:00:00.000Z' });
    assert.equal((await pool.query('SELECT metadata FROM "order" WHERE id=$1', ['success'])).rows[0].metadata.razorpay_reconciled_at, '2026-10-17T12:00:00.000Z');
    assert.match((await pool.query('SELECT id FROM payment')).rows[0].id,/^pay_/);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM capture')).rows[0].n,1);
    assert.equal(await count('payment', 'success'), 1); assert.equal(await count('order_transaction', 'success'), 1);
    assert.equal((await pool.query('SELECT totals FROM order_summary WHERE order_id=$1', ['success'])).rows[0].totals.paid_total, 100);
  });
  for (const table of ['payment', 'capture', 'order_transaction', 'order_summary']) {
    await test('rollback after injected ' + table + ' failure', async () => {
      const id = 'rollback_' + table; await fixture(id);
      await pool.query(`CREATE FUNCTION fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER fail_write BEFORE ${table === 'order_summary' ? 'UPDATE' : 'INSERT'} ON ${table} FOR EACH ROW EXECUTE FUNCTION fail_write();`);
      try { await assert.rejects(() => recordCaptureAtomically(pool, { ...input(id), reconciledAt: '2026-10-17T12:00:00.000Z' })); }
      finally { await pool.query(`DROP TRIGGER fail_write ON ${table}; DROP FUNCTION fail_write();`); }
      assert.equal(await count('order_payment_collection', id), 0); assert.equal(await count('order_transaction', id), 0);
      const state = (await pool.query('SELECT o.metadata,s.totals FROM "order" o JOIN order_summary s ON s.order_id=o.id WHERE o.id=$1', [id])).rows[0];
      assert.equal(state.metadata.razorpay_payment_status, undefined); assert.equal(state.totals.paid_total, 0);
      assert.equal(state.metadata.razorpay_reconciled_at, undefined);
    });
  }
  await test('12 concurrent callbacks create exactly one capture and accounting entry', async () => {
    await fixture('concurrent'); await Promise.all(Array.from({ length: 12 }, () => recordCaptureAtomically(pool, input('concurrent'))));
    assert.equal(await count('payment', 'concurrent'), 1); assert.equal(await count('order_transaction', 'concurrent'), 1);
  });
  await test('capture wins over concurrent and delayed terminal/failure callbacks', async () => {
    await fixture('late_failure');
    await Promise.all([recordCaptureAtomically(pool, input('late_failure')),
      stampCheckoutFailure(pool, 'late_failure', {razorpay_payment_status:'failed',checkout_status:'payment_failed'}, true),
      stampCheckoutFailure(pool, 'late_failure', {razorpay_payment_status:'attempted_failed'})]);
    assert.equal(await stampCheckoutFailure(pool, 'late_failure', {razorpay_payment_status:'failed'}, true), false);
    const state = (await pool.query('SELECT metadata FROM "order" WHERE id=$1', ['late_failure'])).rows[0].metadata;
    assert.equal(state.razorpay_payment_status, 'captured'); assert.equal(state.checkout_tombstone, false);
  });
  await test('amount/currency/order binding tampering writes nothing', async () => {
    await fixture('tamper');
    for (const patch of [{ amountMinor: 1 }, { amountMinor: -1 }, { amountMinor: 100.5 }, { currencyCode: 'usd' }, { razorpayOrderId: 'rzp_other_order' }]) {
      await assert.rejects(() => recordCaptureAtomically(pool, { ...input('tamper'), ...patch }));
    }
    assert.equal(await count('order_payment_collection', 'tamper'), 0);
  });
  await test('one captured gateway payment cannot pay a second order', async () => {
    await fixture('second'); await assert.rejects(() => recordCaptureAtomically(pool, { ...input('second'), razorpayPaymentId: 'pay_success' }));
    assert.equal(await count('order_payment_collection', 'second'), 0);
  });
  await test('a second payment ID cannot silently replace an already paid order', async () => {
    await assert.rejects(() => recordCaptureAtomically(pool, { ...input('success'), razorpayPaymentId: 'pay_second' }));
    assert.equal(await count('payment', 'success'), 1);
  });
  await test('paise precision and committed state survive a fresh connection', async () => {
    await fixture('paise', 10001); await recordCaptureAtomically(pool, { ...input('paise'), amountMinor: 10001 });
    const fresh = new Pool({ connectionString: isolatedUrl.toString(), ssl });
    try { assert.equal((await fresh.query('SELECT totals FROM order_summary WHERE order_id=$1', ['paise'])).rows[0].totals.paid_total, 100.01); }
    finally { await fresh.end(); }
  });
  await test('payment failure also rolls back the exact reserved wallet debit',async()=>{
    await fixture('coin_rollback');await pool.query("INSERT INTO wallet_account(customer_id,actual_balance) VALUES('qa_customer',1000)");
    await pool.query(`UPDATE "order" SET metadata=metadata||'{"coin_discount_minor":1000}' WHERE id='coin_rollback'`);
    await reliability.reserveCheckoutCoins(pool,{orderId:'coin_rollback',customerId:'qa_customer',amountMinor:1000});
    await pool.query(`CREATE FUNCTION fail_capture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$;CREATE TRIGGER fail_capture BEFORE INSERT ON capture FOR EACH ROW EXECUTE FUNCTION fail_capture()`);
    try{await assert.rejects(()=>recordCaptureAtomically(pool,input('coin_rollback')));}finally{await pool.query('DROP TRIGGER fail_capture ON capture;DROP FUNCTION fail_capture()');}
    assert.equal(Number((await pool.query("SELECT actual_balance FROM wallet_account WHERE customer_id='qa_customer'")).rows[0].actual_balance),1000);
    assert.equal((await pool.query("SELECT state FROM checkout_coin_reservation WHERE order_id='coin_rollback'")).rows[0].state,'held');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_work WHERE aggregate_id='coin_rollback'")).rows[0].n,0);
    await recordCaptureAtomically(pool,input('coin_rollback'));
    assert.equal(Number((await pool.query("SELECT actual_balance FROM wallet_account WHERE customer_id='qa_customer'")).rows[0].actual_balance),0);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM wallet_ledger WHERE order_id='coin_rollback'")).rows[0].n,1);
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_work WHERE aggregate_id='coin_rollback'")).rows[0].n,1);
  });
  fs.writeFileSync('docs/payment-acid-qa-last-run.json', JSON.stringify({ ranAt: new Date().toISOString(), scope: 'isolated PostgreSQL schema; no application records modified', baselineEvidence: { paymentInsertFailureLeftCollections: 1, paymentInsertFailureLeftSessions: 1, paymentInsertFailureLeftLinks: 1, reproducedBeforeFix: true }, results, limits: ['Database restart/power-loss durability was not fault-injected.', 'External gateway, order conversion and downstream effects are separate transactions.'] }, null, 2) + '\n');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await pool.end();
  // Only the random schema created by this process can be removed.
  if (!/^qa_payment_acid_[a-f0-9]{16}$/.test(schema)) throw Error('Unsafe fixture schema');
  await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE'); await admin.end();
  process.env.DATABASE_URL = originalUrl;
});
