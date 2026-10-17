/* Real wallet SQL against a disposable PostgreSQL schema. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createHarness}=require('./payment-test-harness.cjs');let h;const results=[];
async function test(name,fn){await fn();results.push({name,result:'PASS'});console.log('PASS:',name);}
(async()=>{
 h=await createHarness();const {pool,load}=h;
 await pool.query(`CREATE TABLE "order"(id text PRIMARY KEY,status text,customer_id text,metadata jsonb DEFAULT '{}',deleted_at timestamptz);
 CREATE TABLE return_request(id text PRIMARY KEY,status text);
 CREATE TABLE wallet_account(customer_id text PRIMARY KEY,actual_balance bigint,updated_at timestamptz DEFAULT now());
 CREATE TABLE wallet_ledger(id bigserial PRIMARY KEY,customer_id text,order_id text,type text,amount bigint,reference_id text,idempotency_key text UNIQUE,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());`);
 await pool.query(load('my-medusa-store/src/lib/payment-reliability.ts').PAYMENT_RELIABILITY_SCHEMA);
 const wallet=load('src/lib/wallet-ledger.ts');const balance=async()=>Number((await pool.query("SELECT actual_balance FROM wallet_account WHERE customer_id='qa'")).rows[0].actual_balance);
 await wallet.creditAdjustment({customerId:'qa',amountMinor:1000,idempotencyKey:'seed'});
 await pool.query(`INSERT INTO "order"(id,customer_id) VALUES('qa_order','qa')`);
 const spend={customerId:'qa',orderId:'qa_order',amountMinor:1000,idempotencyKey:'spend:order:qa_order'};
 await test('replayed spend succeeds after balance exhaustion but mismatched replay fails',async()=>{await wallet.spendCoins(spend);assert.equal((await wallet.spendCoins(spend)).applied,false);assert.equal(await balance(),0);await assert.rejects(()=>wallet.spendCoins({...spend,amountMinor:999}));});
 await test('mixed cancellation and failure retries cannot refund twice',async()=>{const replies=await Promise.all(Array.from({length:12},(_,i)=>wallet.refundOrderCoinSpend({orderId:'qa_order',reason:i%2?'failed':'cancelled'})));assert.equal(replies.filter(r=>r.applied).length,1);assert.equal(await balance(),1000);});
 await test('historical partial credit reduces remaining cancellation refund',async()=>{await pool.query(`INSERT INTO "order"(id,customer_id) VALUES('partial','qa')`);await wallet.spendCoins({...spend,orderId:'partial',idempotencyKey:'spend:order:partial'});await wallet.creditAdjustment({customerId:'qa',amountMinor:300,idempotencyKey:'refund:return:part',metadata:{order_id:'partial',source:'return_settlement'}});const r=await wallet.refundOrderCoinSpend({orderId:'partial',reason:'cancelled'});assert.equal(r.refunded_amount,7);assert.equal(await balance(),1000);});
 await test('delayed failure cannot refund a captured order',async()=>{await pool.query(`UPDATE "order" SET metadata='{"razorpay_payment_status":"captured"}' WHERE id='partial'`);const r=await wallet.refundOrderCoinSpend({orderId:'partial',reason:'failed'});assert.match(r.message,/not eligible/);assert.equal(await balance(),1000);});
 fs.writeFileSync('docs/wallet-refund-qa-last-run.json',JSON.stringify({ranAt:new Date().toISOString(),scope:'isolated PostgreSQL; reservation and original under-debit regression covered by verify-payment-reliability',results},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(h)await h.cleanup();});
