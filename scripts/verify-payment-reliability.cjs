const assert=require('node:assert/strict'),fs=require('node:fs');
const {createHarness}=require('./payment-test-harness.cjs');
const results=[];let h;
async function test(name,fn){await fn();results.push({name,result:'PASS'});console.log('PASS:',name);}
async function main(){
 h=await createHarness();const {pool,load}=h;
 const r=load('my-medusa-store/src/lib/payment-reliability.ts');
 await pool.query(`CREATE TABLE "order"(id text PRIMARY KEY,customer_id text,status text DEFAULT 'pending',metadata jsonb DEFAULT '{}',deleted_at timestamptz,updated_at timestamptz DEFAULT now());
 CREATE TABLE wallet_account(customer_id text PRIMARY KEY,actual_balance bigint NOT NULL,updated_at timestamptz DEFAULT now());
 CREATE TABLE wallet_ledger(id bigserial PRIMARY KEY,customer_id text,order_id text,type text,amount bigint,reference_id text,idempotency_key text UNIQUE,metadata jsonb DEFAULT '{}',created_at timestamptz DEFAULT now());
 CREATE TABLE order_summary(order_id text,version int DEFAULT 1,totals jsonb);
 CREATE TABLE order_line_item(id text PRIMARY KEY,title text DEFAULT 'QA item',unit_price numeric,deleted_at timestamptz);
 CREATE TABLE order_item(id text PRIMARY KEY,item_id text,order_id text,quantity numeric,version int DEFAULT 1,deleted_at timestamptz);
 CREATE TABLE return_request(id text PRIMARY KEY,order_id text,type text,status text,metadata jsonb DEFAULT '{}',deleted_at timestamptz,updated_at timestamptz DEFAULT now(),refunded_at timestamptz);
 CREATE TABLE return_request_item(id bigserial PRIMARY KEY,return_request_id text,order_item_id text,quantity numeric,deleted_at timestamptz);`);
 await pool.query(r.PAYMENT_RELIABILITY_SCHEMA);
 const wallet=load('src/lib/wallet-ledger.ts');
 const coins=load('src/lib/wallet-coin-order.ts');
 const returns=load('my-medusa-store/src/lib/return-financial-settlement.ts');
 async function order(id,customer,discount=0){await pool.query('INSERT INTO "order"(id,customer_id,metadata) VALUES($1,$2,$3)',[id,customer,JSON.stringify({coin_discount_minor:discount})]);}
 const balance=async id=>Number((await pool.query('SELECT actual_balance FROM wallet_account WHERE customer_id=$1',[id])).rows[0]?.actual_balance||0);
 await test('original ₹10 discount / ₹5 balance regression fails closed without partial debit',async()=>{
   await wallet.creditAdjustment({customerId:'short',amountMinor:500,idempotencyKey:'seed_short'});await order('short_order','short',1000);
   await assert.rejects(()=>coins.finalizeCoinSpendForOrder({customerId:'short',orderId:'short_order',amountMinor:1000}),/coin_settlement_requires_attention/);
   assert.equal(await balance('short'),500);assert.equal((await pool.query("SELECT count(*)::int AS n FROM wallet_ledger WHERE type='SPEND'")).rows[0].n,0);
 });
 await test('concurrent checkouts cannot reserve the same balance twice',async()=>{
   await wallet.creditAdjustment({customerId:'race',amountMinor:1000,idempotencyKey:'seed_race'});await order('race_a','race',1000);await order('race_b','race',1000);
   const outcomes=await Promise.allSettled(['race_a','race_b'].map(orderId=>r.reserveCheckoutCoins(pool,{orderId,customerId:'race',amountMinor:1000})));
   assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(await balance('race'),1000);
   assert.equal(Number((await pool.query("SELECT SUM(amount_minor) AS n FROM checkout_coin_reservation WHERE customer_id='race' AND state='held'")).rows[0].n),1000);
 });
 await test('ordinary wallet spend cannot consume a checkout reservation',async()=>{
   await assert.rejects(()=>wallet.spendCoins({customerId:'race',amountMinor:1,idempotencyKey:'steal_hold'}),/Insufficient/);
 });
 await test('reservation is consumed once despite concurrent confirmation retries',async()=>{
   const id=(await pool.query("SELECT order_id FROM checkout_coin_reservation WHERE customer_id='race'")).rows[0].order_id;
   await Promise.all(Array.from({length:8},()=>coins.finalizeCoinSpendForOrder({customerId:'race',orderId:id,amountMinor:1000})));
   assert.equal(await balance('race'),0);assert.equal((await pool.query("SELECT count(*)::int AS n FROM wallet_ledger WHERE customer_id='race' AND type='SPEND'")).rows[0].n,1);
 });
 await test('released reservation cannot silently underfund a late capture',async()=>{
   await wallet.creditAdjustment({customerId:'late',amountMinor:1000,idempotencyKey:'seed_late'});await order('late_order','late',1000);
   await r.reserveCheckoutCoins(pool,{orderId:'late_order',customerId:'late',amountMinor:1000});
   await pool.query(`UPDATE "order" SET metadata=metadata||'{"checkout_tombstone":true}' WHERE id='late_order'`);
   assert.equal(await r.releaseCheckoutCoins(pool,'late_order'),true);
   await wallet.spendCoins({customerId:'late',amountMinor:1000,idempotencyKey:'other_spend'});
   await assert.rejects(()=>coins.finalizeCoinSpendForOrder({customerId:'late',orderId:'late_order',amountMinor:1000}),/coin_settlement_requires_attention/);
   assert.equal(await balance('late'),0);
 });
 await test('same job is queued once and claimed once across workers',async()=>{
   await Promise.all(Array.from({length:10},()=>r.enqueuePaymentWork(pool,'test','one')));
   const jobs=await Promise.all(Array.from({length:10},()=>r.claimPaymentWork(pool)));
   assert.equal(jobs.filter(Boolean).length,1);
 });
 await test('crashed worker lease expires; stale acknowledgement is fenced out',async()=>{
   const old=(await pool.query("SELECT * FROM payment_work WHERE aggregate_id='one'")).rows[0];
   await pool.query("UPDATE payment_work SET leased_until=now()-interval '1 second' WHERE id=$1",[old.id]);
   const retry=await r.claimPaymentWork(pool);assert.equal(retry.id,old.id);assert.notEqual(retry.lease_token,old.lease_token);
   assert.equal(await r.finishPaymentWork(pool,old),false);assert.equal(await r.finishPaymentWork(pool,retry),true);
 });
 await test('failed work backs off and exhausted work remains visible as dead',async()=>{
   await r.enqueuePaymentWork(pool,'test','retry');const job=await r.claimPaymentWork(pool);
   await r.finishPaymentWork(pool,job,'injected_http_503');assert.equal(await r.claimPaymentWork(pool),null);
   await pool.query("UPDATE payment_work SET available_at=now(),attempts=11 WHERE id=$1",[job.id]);
   const last=await r.claimPaymentWork(pool);await r.finishPaymentWork(pool,last,'injected_http_503');
   assert.equal((await pool.query('SELECT state FROM payment_work WHERE id=$1',[job.id])).rows[0].state,'dead');
 });
 await test('queue insertion and financial commit roll back together',async()=>{
   await assert.rejects(()=>r.transaction(pool,async client=>{await r.enqueuePaymentWork(client,'test','rollback');throw Error('injected crash');}));
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM payment_work WHERE aggregate_id='rollback'")).rows[0].n,0);
 });
 await test('paise allocations remain exact and deterministic',async()=>{
   for(let n=0;n<100;n++){const a=r.allocateMinor(n,[{id:'a',weight:1},{id:'b',weight:1},{id:'c',weight:1}]);assert.equal(a.reduce((sum,x)=>sum+x.amount,0),n);}
 });
 await wallet.creditAdjustment({customerId:'return_customer',amountMinor:1001,idempotencyKey:'return_seed'});await order('return_order','return_customer',1001);
 await pool.query(`UPDATE "order" SET metadata=metadata||'{"razorpay_amount_minor":19999,"expected_shipping_price":10}' WHERE id='return_order'`);
 await pool.query("INSERT INTO order_line_item(id,unit_price) VALUES('item_a',100),('item_b',100)");
 await pool.query("INSERT INTO order_item(id,item_id,order_id,quantity) VALUES('oi_a','item_a','return_order',1),('oi_b','item_b','return_order',1)");
 await coins.finalizeCoinSpendForOrder({customerId:'return_customer',orderId:'return_order',amountMinor:1001});
 await wallet.earnCoins({customerId:'return_customer',orderId:'return_order',amountMinor:200});
 async function returnFixture(id,item){await pool.query("INSERT INTO return_request(id,order_id,type,status) VALUES($1,'return_order','return','received')",[id]);await pool.query('INSERT INTO return_request_item(return_request_id,order_item_id,quantity) VALUES($1,$2,1)',[id,item]);}
 await returnFixture('return_a','item_a');await returnFixture('return_b','item_b');
 await test('partial return refunds only its allocation and preserves sibling item',async()=>{
   const quote=await r.transaction(pool,c=>returns.quoteReturnSettlement(c,'return_a'));
   assert.equal(quote.coin_minor,501);assert.equal(quote.cash_minor,9500);
   await returns.recordManualReturnRefund(pool,{returnId:'return_a',actorId:'admin',payoutReference:'UTR-TEST-A',cashMinor:9500});
   assert.equal(await balance('return_customer'),601); // 200 earned +501 restored -100 earned reversal
   assert.equal((await pool.query("SELECT status FROM return_request WHERE id='return_b'")).rows[0].status,'received');
 });
 await test('concurrent duplicate manual acknowledgement records one receipt and one credit',async()=>{
   await Promise.all(Array.from({length:6},()=>returns.recordManualReturnRefund(pool,{returnId:'return_a',actorId:'admin',payoutReference:'UTR-TEST-A',cashMinor:9500})));
   assert.equal(await balance('return_customer'),601);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM return_financial_settlement WHERE return_id='return_a'")).rows[0].n,1);
   await assert.rejects(()=>returns.recordManualReturnRefund(pool,{returnId:'return_a',actorId:'admin',payoutReference:'DIFFERENT',cashMinor:9500}),/refund_receipt_conflict/);
 });
 await test('wrong payout amount is rejected before status or balance changes',async()=>{
   await assert.rejects(()=>returns.recordManualReturnRefund(pool,{returnId:'return_b',actorId:'admin',payoutReference:'UTR-TEST-B',cashMinor:1}),/refund_quote_changed/);
   assert.equal(await balance('return_customer'),601);
 });
 await test('refund insertion failure rolls back status, coins, receipt and outbox',async()=>{
   await pool.query(`CREATE FUNCTION fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;CREATE TRIGGER fail_receipt BEFORE INSERT ON return_financial_settlement FOR EACH ROW EXECUTE FUNCTION fail_receipt()`);
   try{await assert.rejects(()=>returns.recordManualReturnRefund(pool,{returnId:'return_b',actorId:'admin',payoutReference:'UTR-TEST-B',cashMinor:9499}));}finally{await pool.query('DROP TRIGGER fail_receipt ON return_financial_settlement;DROP FUNCTION fail_receipt()');}
   assert.equal(await balance('return_customer'),601);assert.equal((await pool.query("SELECT status FROM return_request WHERE id='return_b'")).rows[0].status,'received');
 });
 await test('sequential partial returns restore exactly the full original debit, including final paise',async()=>{
   await returns.recordManualReturnRefund(pool,{returnId:'return_b',actorId:'admin',payoutReference:'UTR-TEST-B',cashMinor:9499});
   assert.equal(await balance('return_customer'),1001);
   const totals=(await pool.query("SELECT SUM(coin_minor) AS coins,SUM(cash_minor) AS cash FROM return_financial_settlement")).rows[0];assert.equal(Number(totals.coins),1001);assert.equal(Number(totals.cash),18999);
 });
 await test('overlapping returns cannot refund more than ordered quantity',async()=>{
   await returnFixture('overlap','item_a');await assert.rejects(()=>r.transaction(pool,c=>returns.quoteReturnSettlement(c,'overlap')),/return_quantity_exceeds_remaining/);
 });
 await test('rewards credited after a partial return cover only retained items',async()=>{
   await order('late_reward','late_reward_customer');
   await pool.query(`UPDATE "order" SET metadata=metadata||'{"razorpay_amount_minor":20000}' WHERE id='late_reward'`);
   await pool.query("INSERT INTO order_line_item(id,unit_price) VALUES('lr_a',100),('lr_b',100)");
   await pool.query("INSERT INTO order_item(id,item_id,order_id,quantity) VALUES('lr_oa','lr_a','late_reward',1),('lr_ob','lr_b','late_reward',1)");
   for(const item of ['a','b']) {await pool.query("INSERT INTO return_request(id,order_id,type,status) VALUES($1,'late_reward','return','received')",['lr_'+item]);await pool.query('INSERT INTO return_request_item(return_request_id,order_item_id,quantity) VALUES($1,$2,1)',['lr_'+item,'lr_'+item]);}
   await returns.recordManualReturnRefund(pool,{returnId:'lr_a',actorId:'admin',payoutReference:'LR-REF-A',cashMinor:10000});
   await wallet.earnCoins({customerId:'late_reward_customer',orderId:'late_reward',amountMinor:200});assert.equal(await balance('late_reward_customer'),100);
   await returns.recordManualReturnRefund(pool,{returnId:'lr_b',actorId:'admin',payoutReference:'LR-REF-B',cashMinor:10000});assert.equal(await balance('late_reward_customer'),0);
 });
 await pool.query(`ALTER TABLE order_line_item ADD product_id text;ALTER TABLE order_line_item ADD variant_id text;
 CREATE TABLE product(id text PRIMARY KEY,metadata jsonb);CREATE TABLE product_variant(id text PRIMARY KEY,product_id text);
 CREATE TABLE customer_referrer_coins_log(id text PRIMARY KEY,affiliate_customer_id text,referred_customer_id text,refer_code text,product_id text,order_id text,coins numeric,status text,unlocked_at timestamptz);
 CREATE TABLE customer_referrer(customer_id text PRIMARY KEY,pending_coins numeric DEFAULT 0,earned_coins numeric DEFAULT 0,updated_at timestamptz DEFAULT now());
 CREATE TABLE customer_referrer_referrals(refer_code text,referred_customer_id text,coins_earned numeric DEFAULT 0);
 CREATE TABLE vendor_earnings_log(id text PRIMARY KEY,vendor_id text,order_id text,gross_amount numeric DEFAULT 0,taxable_amount numeric DEFAULT 0,gst_amount numeric DEFAULT 0,commission_amount numeric DEFAULT 0,tcs_amount numeric DEFAULT 0,tds_amount numeric DEFAULT 0,logistic_fee numeric DEFAULT 0,return_fee numeric DEFAULT 0,net_amount numeric,status text,credited_at timestamptz,unlock_at timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(vendor_id,order_id));`);
 const earnings=load('my-medusa-store/src/lib/return-earnings-settlement.ts');
 await order('vendor_partial','vendor_customer');
 await pool.query(`UPDATE "order" SET metadata=metadata||'{"razorpay_amount_minor":30000}' WHERE id='vendor_partial'`);
 await pool.query(`INSERT INTO product(id,metadata) VALUES('product_a','{"vendor_id":"vendor_a"}'),('product_b','{"vendor_id":"vendor_b"}');
 INSERT INTO order_line_item(id,unit_price,product_id) VALUES('vp_a',100,'product_a'),('vp_b',100,'product_b');
 INSERT INTO order_item(id,item_id,order_id,quantity) VALUES('vp_oa','vp_a','vendor_partial',2),('vp_ob','vp_b','vendor_partial',1);
 INSERT INTO vendor_earnings_log(id,vendor_id,order_id,net_amount,status) VALUES('ve_a','vendor_a','vendor_partial',180,'ON_HOLD'),('ve_b','vendor_b','vendor_partial',90,'CREDITED');
 INSERT INTO customer_referrer(customer_id,earned_coins) VALUES('referrer',20);
 INSERT INTO customer_referrer_coins_log(id,affiliate_customer_id,referred_customer_id,refer_code,product_id,order_id,coins,status)
 VALUES('ref_a','referrer','vendor_customer','CODE','product_a','vendor_partial',20,'EARNED');`);
 await wallet.creditAdjustment({customerId:'referrer',amountMinor:2000,idempotencyKey:'referrer_seed'});
 async function vpReturn(id){await pool.query("INSERT INTO return_request(id,order_id,type,status) VALUES($1,'vendor_partial','return','received')",[id]);await pool.query("INSERT INTO return_request_item(return_request_id,order_item_id,quantity) VALUES($1,'vp_a',1)",[id]);await returns.recordManualReturnRefund(pool,{returnId:id,actorId:'admin',payoutReference:'UTR-'+id,cashMinor:10000});}
 await test('partial quantity reverses only its vendor and referral share',async()=>{
   await vpReturn('vp_return_a');await earnings.settleReturnEarnings(pool,'vp_return_a');
   assert.equal(await balance('referrer'),1000);
   const vendorRows=(await pool.query("SELECT vendor_id,SUM(net_amount) AS n FROM vendor_earnings_log GROUP BY vendor_id")).rows;
   assert.equal(Number(vendorRows.find(x=>x.vendor_id==='vendor_a').n),90);assert.equal(Number(vendorRows.find(x=>x.vendor_id==='vendor_b').n),90);
 });
 await test('replayed return earnings job cannot debit vendor or referrer twice',async()=>{
   await Promise.all(Array.from({length:5},()=>earnings.settleReturnEarnings(pool,'vp_return_a')));assert.equal(await balance('referrer'),1000);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM vendor_earnings_log WHERE order_id='clawback:return:vp_return_a'")).rows[0].n,1);
 });
 await test('final quantity return reverses remaining earnings without touching sibling vendor',async()=>{
   await vpReturn('vp_return_b');await earnings.settleReturnEarnings(pool,'vp_return_b');await earnings.settleReturnEarnings(pool,'vp_return_a');
   assert.equal(await balance('referrer'),0);
   assert.equal(Number((await pool.query("SELECT SUM(net_amount) AS n FROM vendor_earnings_log WHERE vendor_id='vendor_a'")).rows[0].n),0);
   assert.equal(Number((await pool.query("SELECT SUM(net_amount) AS n FROM vendor_earnings_log WHERE vendor_id='vendor_b'")).rows[0].n),90);
 });
 await pool.query(`ALTER TABLE "order" ADD version int DEFAULT 1;ALTER TABLE order_item ADD fulfilled_quantity numeric DEFAULT 0;
 ALTER TABLE product_variant ADD manage_inventory boolean DEFAULT true;ALTER TABLE product_variant ADD allow_backorder boolean DEFAULT false;
 CREATE TABLE stock_location(id text PRIMARY KEY);INSERT INTO stock_location VALUES('loc');
 CREATE TABLE product_variant_inventory_item(variant_id text,inventory_item_id text,required_quantity numeric DEFAULT 1,deleted_at timestamptz);
 CREATE TABLE inventory_level(id text PRIMARY KEY,inventory_item_id text,location_id text,stocked_quantity numeric,reserved_quantity numeric DEFAULT 0,raw_reserved_quantity jsonb,deleted_at timestamptz,updated_at timestamptz DEFAULT now());
 CREATE TABLE reservation_item(id text PRIMARY KEY,line_item_id text,location_id text,quantity numeric,raw_quantity jsonb,inventory_item_id text,allow_backorder boolean,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz);
 INSERT INTO product_variant(id,product_id) VALUES('stock_variant','stock_product');
 INSERT INTO product_variant_inventory_item(variant_id,inventory_item_id,required_quantity) VALUES('stock_variant','stock_inventory',1);
 INSERT INTO inventory_level(id,inventory_item_id,location_id,stocked_quantity) VALUES('level','stock_inventory','loc',1);`);
 load.stub('src/lib/medusa-admin.ts',{});
 const medusa=load('src/lib/medusa-payment.ts');
 async function stockOrder(id){await order(id,'stock_customer');await pool.query("INSERT INTO order_line_item(id,unit_price,variant_id) VALUES($1,100,'stock_variant')",['line_'+id]);await pool.query('INSERT INTO order_item(id,item_id,order_id,quantity) VALUES($1,$2,$3,1)',['oi_'+id,'line_'+id,id]);}
 await test('concurrent readiness retries cannot reserve the same line twice',async()=>{
   await stockOrder('stock_a');const replies=await Promise.all(Array.from({length:6},()=>medusa.ensureOrderReservations('stock_a')));assert(replies.every(r=>r.success),JSON.stringify(replies));
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM reservation_item WHERE line_item_id='line_stock_a'")).rows[0].n,1);
   assert.equal(Number((await pool.query("SELECT reserved_quantity FROM inventory_level WHERE id='level'")).rows[0].reserved_quantity),1);
 });
 await test('another paid order cannot silently reserve unavailable stock',async()=>{
   await stockOrder('stock_b');assert.equal((await medusa.ensureOrderReservations('stock_b')).success,false);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM reservation_item WHERE line_item_id='line_stock_b'")).rows[0].n,0);
 });
 await test('completed fulfillment and cancelled orders are not re-reserved on retry',async()=>{
   await pool.query("UPDATE order_item SET fulfilled_quantity=quantity WHERE order_id='stock_b'");assert.equal((await medusa.ensureOrderReservations('stock_b')).success,true);
   await stockOrder('stock_c');await pool.query("UPDATE \"order\" SET status='canceled' WHERE id='stock_c'");assert.equal((await medusa.ensureOrderReservations('stock_c')).success,true);
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM reservation_item WHERE line_item_id IN ('line_stock_b','line_stock_c')")).rows[0].n,0);
 });
 await test('inventory write fault rolls back reservation and level together',async()=>{
   await pool.query("UPDATE inventory_level SET stocked_quantity=10 WHERE id='level'");await stockOrder('stock_d');
   await pool.query(`CREATE FUNCTION fail_level() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected level fault'; END $$;CREATE TRIGGER fail_level BEFORE UPDATE ON inventory_level FOR EACH ROW EXECUTE FUNCTION fail_level()`);
   try{assert.equal((await medusa.ensureOrderReservations('stock_d')).success,false);}finally{await pool.query('DROP TRIGGER fail_level ON inventory_level;DROP FUNCTION fail_level()');}
   assert.equal((await pool.query("SELECT count(*)::int AS n FROM reservation_item WHERE line_item_id='line_stock_d'")).rows[0].n,0);
   assert.equal(Number((await pool.query("SELECT reserved_quantity FROM inventory_level WHERE id='level'")).rows[0].reserved_quantity),1);
 });
 await test('paid allocations survive price, vendor and metadata edits; shipping stays retained',async()=>{
   await order('frozen_order','frozen_customer');
   await pool.query(`UPDATE "order" SET metadata='{"razorpay_amount_minor":25000,"expected_shipping_price":50}' WHERE id='frozen_order';
     INSERT INTO order_line_item(id,unit_price,product_id) VALUES('frozen_item',100,'product_a');
     INSERT INTO order_item(id,item_id,order_id,quantity) VALUES('frozen_oi','frozen_item','frozen_order',2);`);
   await r.transaction(pool,c=>r.freezePaidOrderItems(c,{orderId:'frozen_order',cashMinor:25000,coinMinor:0,shippingMinor:5000}));
   await pool.query(`UPDATE order_line_item SET unit_price=900 WHERE id='frozen_item';UPDATE "order" SET metadata='{}' WHERE id='frozen_order';
     INSERT INTO return_request(id,order_id,type,status) VALUES('frozen_return','frozen_order','return','received');
     INSERT INTO return_request_item(return_request_id,order_item_id,quantity) VALUES('frozen_return','frozen_item',1);`);
   const quote=await r.transaction(pool,c=>returns.quoteReturnSettlement(c,'frozen_return'));assert.equal(quote.cash_minor,10000);
   await returns.recordManualReturnRefund(pool,{returnId:'frozen_return',actorId:'admin',payoutReference:'UTR-FROZEN',cashMinor:10000});
   await assert.rejects(()=>pool.query("UPDATE return_financial_settlement SET cash_minor=1 WHERE return_id='frozen_return'"),/immutable/);
   await assert.rejects(()=>pool.query("DELETE FROM payment_order_item_snapshot WHERE order_id='frozen_order'"),/immutable/);
   await assert.rejects(()=>pool.query("UPDATE return_request SET status='approved' WHERE id='frozen_return'"),/cannot change status/);
 });
 await test('worker attempt history records lease loss and completion',async()=>{
   const rows=(await pool.query("SELECT outcome FROM payment_work_attempt WHERE job_id='test:one' ORDER BY id")).rows;
   assert.deepEqual(rows.map(x=>x.outcome),['expired','done']);
 });
 await test('twelve process crashes exhaust retries visibly',async()=>{
   await pool.query("UPDATE payment_work SET state='done' WHERE state IN ('pending','working')");
   await r.enqueuePaymentWork(pool,'test','crash_limit');const job=await r.claimPaymentWork(pool);
   await pool.query("UPDATE payment_work SET attempts=12,leased_until=now()-interval '1 second' WHERE id=$1",[job.id]);
   assert.equal(await r.claimPaymentWork(pool),null);
   assert.equal((await pool.query('SELECT state FROM payment_work WHERE id=$1',[job.id])).rows[0].state,'dead');
 });
 const policy=load('src/lib/wallet-policy.ts');
 await test('delivery credit racing with delayed partial-return jobs has no excess referral credit',async()=>{
   await pool.query(`INSERT INTO customer_referrer_coins_log(id,affiliate_customer_id,referred_customer_id,refer_code,product_id,order_id,coins,status)
     VALUES('ref_late','referrer','vendor_customer','CODE','product_a','vendor_partial',20,'PENDING');
     UPDATE customer_referrer SET pending_coins=20 WHERE customer_id='referrer'`);
   const referral=load('my-medusa-store/src/lib/referral-wallet-settlement.ts');
   await Promise.all([referral.creditReferralCoinsForOrder(pool,'vendor_partial'),earnings.settleReturnEarnings(pool,'vp_return_a'),earnings.settleReturnEarnings(pool,'vp_return_b')]);
   await referral.creditReferralCoinsForOrder(pool,'vendor_partial');assert.equal(await balance('referrer'),0);
   assert.equal(Number((await pool.query("SELECT earned_coins+pending_coins AS n FROM customer_referrer WHERE customer_id='referrer'")).rows[0].n),0);
 });
 await test('snapshot recovery transfers the original exact hold once to the rebuilt order',async()=>{
   await wallet.creditAdjustment({customerId:'rebuild',amountMinor:1000,idempotencyKey:'rebuild_seed'});
   await order('rebuild_original','rebuild',1000);await order('rebuild_new','rebuild',1000);
   const hold=await r.reserveCheckoutCoins(pool,{orderId:'rebuild_original',customerId:'rebuild',amountMinor:1000});
   const metadata={coin_discount_minor:1000,coin_reservation_id:hold,recovered_from_snapshot:true,original_medusa_order_id:'rebuild_original'};
   await r.transaction(pool,c=>r.consumeCheckoutCoins(c,{orderId:'rebuild_new',customerId:'rebuild',metadata}));
   assert.equal(await balance('rebuild'),0);assert.equal((await pool.query('SELECT order_id,state FROM checkout_coin_reservation WHERE id=$1',[hold])).rows[0].order_id,'rebuild_new');
 });
 await test('coin caps and cheap goods never consume delivery charges',async()=>{
   assert.equal(policy.eligibleCoinDiscount({subtotal:10,shipping:50,otherDiscounts:0,balance:500}),10);
   assert.equal(policy.eligibleCoinDiscount({subtotal:100,shipping:50,otherDiscounts:95,balance:500}),5);
   for(const [total,cap] of [[199,20],[200,40],[499,40],[500,60],[999,60],[1000,100],[1499,100],[1500,150]])assert.equal(policy.maxRedeemableCoins(total),cap);
 });
 fs.writeFileSync('docs/payment-reliability-qa-last-run.json',JSON.stringify({ranAt:new Date().toISOString(),scope:'isolated PostgreSQL schema; no real customer records or payouts changed',results},null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(h)await h.cleanup();});
