/* Verify our outbound contract against an idempotent receiver, never the real affiliate service. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const {createHarness}=require('./payment-test-harness.cjs');let h;const results=[];const originalFetch=globalThis.fetch;
async function test(name,fn){await fn();results.push({name,result:'PASS'});console.log('PASS:',name);}
(async()=>{
 h=await createHarness();const {pool,load}=h;
 await pool.query(`CREATE TABLE return_request(id text PRIMARY KEY,status text);CREATE TABLE wallet_ledger(idempotency_key text,order_id text,type text);`);
 const reliability=load('my-medusa-store/src/lib/payment-reliability.ts');await pool.query(reliability.PAYMENT_RELIABILITY_SCHEMA);
 for(const name of ['medusa-payment','checkout-order','customer-affiliate-coins','medusa-admin','razorpay','razorpay-capture-recover','wallet-coin-order','oweg10'])load.stub('src/lib/'+name+'.ts',{});
 load.stub('src/lib/wallet-ledger.ts',{getPool:()=>pool});
 process.env.AFFILIATE_WEBHOOK_URL='https://receiver.invalid/test';process.env.AFFILIATE_WEBHOOK_IDEMPOTENT='true';
 const runner=load('src/lib/payment-work-runner.ts');let requests=0,effects=0;const received=new Set();let unavailable=false;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://receiver.invalid/test');requests++;const body=JSON.parse(options.body);assert.equal(options.headers['idempotency-key'],body.event_id);if(unavailable)return {ok:false,status:503};if(!received.has(body.event_id)){received.add(body.event_id);effects++;}return {ok:true,status:200};};
 await test('crash after receiver acceptance reuses same key and produces one external effect',async()=>{
   await reliability.enqueuePaymentWork(pool,'affiliate_paid','item_test',{order_id:'order_test'});const first=await reliability.claimPaymentWork(pool);
   await runner.handleWork(first); // Receiver accepted, then simulate death before acknowledgement.
   await pool.query("UPDATE payment_work SET leased_until=now()-interval '1 second' WHERE id=$1",[first.id]);
   const retry=await reliability.claimPaymentWork(pool);await runner.handleWork(retry);await reliability.finishPaymentWork(pool,retry);
   assert.equal(requests,2);assert.equal(effects,1);assert.equal(await reliability.finishPaymentWork(pool,first),false);
 });
 await test('receiver failure remains pending and retries after recovery',async()=>{
   await reliability.enqueuePaymentWork(pool,'affiliate_paid','item_retry',{});unavailable=true;const first=await reliability.claimPaymentWork(pool);
   await assert.rejects(()=>runner.handleWork(first),/affiliate_delivery_http_503/);await reliability.finishPaymentWork(pool,first,'affiliate_delivery_http_503');assert.equal(effects,1);
   unavailable=false;await pool.query('UPDATE payment_work SET available_at=now() WHERE id=$1',[first.id]);const retry=await reliability.claimPaymentWork(pool);await runner.handleWork(retry);await reliability.finishPaymentWork(pool,retry);assert.equal(effects,2);
 });
 fs.writeFileSync('docs/payment-outbound-qa-last-run.json',JSON.stringify({ranAt:new Date().toISOString(),scope:'isolated PostgreSQL queue + simulated idempotent receiver; production receiver contract remains unverified',results},null,2)+'\n');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{globalThis.fetch=originalFetch;if(h)await h.cleanup();});
