/* Live test-mode API checks. Credentials stay in environment variables and memory. */
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
require('@next/env').loadEnvConfig(process.cwd());
if (!process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')) throw Error('Test gateway keys required');
const orderId = process.env.QA_CAPTURED_ORDER_ID;
if (!orderId || !process.env.QA_CUSTOMER_EMAIL || !process.env.QA_CUSTOMER_PASSWORD) throw Error('QA order and customer credentials required');
const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('amazonaws.com')?{rejectUnauthorized:false}:undefined});
const base = 'http://localhost:3000';
const results = [];
async function call(path, body, cookie) {
  const response = await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json(),response};
}
async function test(name,fn) {await fn();results.push({name,result:'PASS'});console.log('PASS:',name);}
async function main() {
  const order = (await pool.query('SELECT metadata FROM "order" WHERE id=$1 AND deleted_at IS NULL',[orderId])).rows[0];
  assert(order?.metadata?.razorpay_payment_status==='captured','Existing captured test order required');
  const m=order.metadata;
  const signature=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET).update(m.razorpay_order_id+'|'+m.razorpay_payment_id).digest('hex');
  const confirm={medusaOrderId:orderId,razorpay_payment_id:m.razorpay_payment_id,razorpay_order_id:m.razorpay_order_id,razorpay_signature:signature};
  await test('invalid webhook rejected; authorized event cannot mark an order captured',async()=>{
    const raw=JSON.stringify({event:'payment.authorized',payload:{payment:{entity:{id:'pay_qa_authorized_only',status:'authorized',notes:{medusa_order_id:'qa_nonexistent_authorization_fixture'}}}}});
    const invalid=await fetch(base+'/webhooks/razorpay',{method:'POST',headers:{'x-razorpay-signature':'invalid','content-type':'application/json'},body:raw});
    assert.equal(invalid.status,400);
    assert(process.env.RAZORPAY_WEBHOOK_SECRET,'Webhook test secret required');
    const signed=crypto.createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    const authorized=await fetch(base+'/webhooks/razorpay',{method:'POST',headers:{'x-razorpay-signature':signed,'content-type':'application/json'},body:raw});
    assert.equal(authorized.status,200);assert.equal((await authorized.json()).awaiting_capture,true);
  });
  await test('missing confirmation fields and invalid signature rejected',async()=>{
    assert.equal((await call('/api/checkout/razorpay/confirm',{})).status,400);
    assert.equal((await call('/api/checkout/razorpay/confirm',{...confirm,razorpay_signature:'0'.repeat(64)})).status,400);
  });
  await test('valid signature cannot override server amount or currency',async()=>{
    assert.equal((await call('/api/checkout/razorpay/confirm',{...confirm,amount_minor:1})).status,409);
    assert.equal((await call('/api/checkout/razorpay/confirm',{...confirm,currency:'USD'})).status,409);
    assert.equal((await call('/api/checkout/razorpay/confirm',{...confirm,amount_minor:0.5})).status,400);
  });
  await test('anonymous callers cannot read, mint, cancel or select COD for an order',async()=>{
    assert.equal((await call('/api/checkout/order-summary?orderId='+orderId)).status,401);
    assert.equal((await call('/api/create-razorpay-order',{medusaOrderId:orderId})).status,401);
    assert.equal((await call('/api/checkout/cod',{medusaOrderId:orderId})).status,401);
    assert.equal((await call('/api/checkout/payment-failed',{medusaOrderId:orderId})).status,401);
    assert.equal((await call('/api/checkout/razorpay/reconcile',{medusaOrderId:orderId})).status,401);
  });
  const login=await call('/api/medusa/auth/login',{identifier:process.env.QA_CUSTOMER_EMAIL,password:process.env.QA_CUSTOMER_PASSWORD});
  assert.equal(login.status,200,'Customer login failed');
  const cookie=login.response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  assert(cookie,'Login cookie required');
  await test('owner can view safe order summary without signature metadata',async()=>{
    const r=await call('/api/checkout/order-summary?orderId='+orderId,undefined,cookie);
    assert.equal(r.status,200);assert(!JSON.stringify(r.data).includes(signature));
    assert(!JSON.stringify(r.data).includes('razorpay_signature'));
  });
  const foreign=(await pool.query('SELECT id FROM "order" WHERE customer_id IN (SELECT id FROM customer WHERE email=$1) AND deleted_at IS NULL LIMIT 1',['qa-payment-matrix@example.com'])).rows[0]?.id;
  assert(foreign,'Dedicated QA foreign order required');
  await test('a valid signed capture cannot be attached to a different checkout',async()=>{
    assert.equal((await call('/api/checkout/razorpay/confirm',{...confirm,medusaOrderId:foreign})).status,409);
  });
  await test('authenticated customer cannot access another customer order',async()=>{
    assert.equal((await call('/api/checkout/order-summary?orderId='+foreign,undefined,cookie)).status,403);
    assert.equal((await call('/api/checkout/razorpay/reconcile',{medusaOrderId:foreign},cookie)).status,403);
  });
  await test('concurrent real-gateway reconciliation leaves one payment and accounting entry',async()=>{
    const replies=await Promise.all(Array.from({length:3},()=>call('/api/checkout/razorpay/reconcile',{medusaOrderId:orderId},cookie)));
    for(const reply of replies) assert.equal(reply.status,200,JSON.stringify(reply.data));
    const state=(await pool.query(`SELECT
      (SELECT count(*) FROM payment p JOIN order_payment_collection opc ON opc.payment_collection_id=p.payment_collection_id WHERE opc.order_id=$1 AND p.deleted_at IS NULL)::int AS payments,
      (SELECT count(*) FROM order_transaction WHERE order_id=$1 AND reference='capture' AND deleted_at IS NULL)::int AS accounting`,[orderId])).rows[0];
    assert.equal(state.payments,1);assert.equal(state.accounting,1);
  });
  fs.writeFileSync('docs/payment-api-qa-last-run.json',JSON.stringify({ranAt:new Date().toISOString(),orderId,scope:'test gateway; no new charge; captured order reconciled',results},null,2)+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>pool.end());
