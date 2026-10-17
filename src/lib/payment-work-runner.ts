import { getPool } from "@/lib/wallet-ledger";
import { claimPaymentWork,enqueuePaymentWork,finishPaymentWork,transaction,type PaymentWork } from "@/lib/payment-reliability";
import { ensurePlacedOrderFulfillmentReady } from "@/lib/medusa-payment";
import { runPostConvertCheckoutSideEffects,loadCheckoutOrder,markCheckoutPaymentFailed } from "@/lib/checkout-order";
import { logPendingCoinsForOrder,creditPendingCoinsForOrder } from "@/lib/customer-affiliate-coins";
import { updateOrderMetadata } from "@/lib/medusa-admin";
import { fetchRazorpayOrderPayments } from "@/lib/razorpay";
import { recoverRazorpayCapture } from "@/lib/razorpay-capture-recover";
import { settleReturnEarnings } from "../../my-medusa-store/src/lib/return-earnings-settlement";
import {finalizeCoinSpendForOrder} from "@/lib/wallet-coin-order";
import {releaseCheckoutCoins} from "@/lib/payment-reliability";
import {consumeOweg10Reservation,syncOweg10ConsumedCustomerMetadata} from "@/lib/oweg10";

export async function handleWork(job:PaymentWork) {
 const pool=getPool();
 if(job.kind==='capture_repair') {
   const result=await recoverRazorpayCapture({medusaOrderId:job.aggregate_id,razorpayPaymentId:String(job.payload.payment_id||''),razorpayOrderId:String(job.payload.gateway_order_id||'')});
   if(!result.ok)throw new Error('capture_repair_'+result.error);
   return;
 }
 if(job.kind==='payment_paid') {
   const loaded=await loadCheckoutOrder(job.aggregate_id);
   if(!loaded)throw new Error('paid_order_missing');
   const meta=loaded.order.metadata||{};
   if(['canceled','cancelled'].includes(String(loaded.order.status)))return;
   if(meta.razorpay_payment_status!=='captured'&&meta.cod_status!=='confirmed')throw new Error('order_not_paid_or_cod_confirmed');
   const coinMinor=Number(meta.coin_discount_minor||0);
   if(coinMinor)await finalizeCoinSpendForOrder({orderId:job.aggregate_id,customerId:String(loaded.order.customer_id||''),amountMinor:coinMinor});
   if(meta.oweg10_reservation_token&&!meta.oweg10_consumed) {
     const customerId=String(meta.oweg10_customer_id||loaded.order.customer_id||'');
     const result=await consumeOweg10Reservation({customerId,reservationToken:String(meta.oweg10_reservation_token),orderId:job.aggregate_id,metadata:{source:'payment_work'}});
     if(!result.ok)throw new Error('coupon_settlement_requires_attention');
     await syncOweg10ConsumedCustomerMetadata(customerId);
   }
   await runPostConvertCheckoutSideEffects(job.aggregate_id,meta);
   const ready=await ensurePlacedOrderFulfillmentReady(job.aggregate_id);
   if(!ready.shipping.success||!ready.reservations.success)throw new Error('fulfillment_readiness_incomplete');
   await logPendingCoinsForOrder(job.aggregate_id);
   // A return may finish while this job is waiting for inventory or a process restart.
   const receipts=(await pool.query('SELECT return_id FROM return_financial_settlement WHERE order_id=$1 ORDER BY created_at,return_id',[job.aggregate_id])).rows;
   for(const receipt of receipts)await settleReturnEarnings(pool,receipt.return_id);
   if(meta.delivered_at||meta.fulfillment_status==='delivered')await creditPendingCoinsForOrder(job.aggregate_id);
   const customer=(await pool.query(`SELECT c.id,c.email,c.first_name,c.last_name,
     COALESCE(cr.referral_code,c.metadata->>'referral_code') AS referral_code FROM "order" o
     JOIN customer c ON c.id=o.customer_id LEFT JOIN customer_referral cr ON cr.customer_id=c.id WHERE o.id=$1`,[job.aggregate_id])).rows[0];
   if(customer?.referral_code) {
     const items=(await pool.query(`SELECT oi.id,oli.product_id,oli.title,oi.quantity,oli.unit_price FROM order_item oi
       JOIN order_line_item oli ON oli.id=oi.item_id WHERE oi.order_id=$1 AND oi.deleted_at IS NULL`,[job.aggregate_id])).rows;
     await transaction(pool,async client=>{
       for(const item of items)await enqueuePaymentWork(client,'affiliate_paid',`${job.aggregate_id}:${item.id}`,{
         order_id:job.aggregate_id,item_id:item.id,product_id:item.product_id,product_name:item.title,
         quantity:Number(item.quantity),item_price:Number(item.unit_price),order_amount:Number(item.unit_price)*Number(item.quantity),
         affiliate_code:customer.referral_code,customer_id:customer.id,customer_name:[customer.first_name,customer.last_name].filter(Boolean).join(' '),customer_email:customer.email,status:'PENDING',
       });
     });
   }
   const result=await updateOrderMetadata(job.aggregate_id,{payment_post_process_done:true,cod_post_process_done:meta.payment_method==='cod'||undefined});
   if(!result.ok)throw new Error('paid_metadata_sync_failed');
   return;
 }
 if(job.kind==='affiliate_paid') {
   const url=process.env.AFFILIATE_WEBHOOK_URL;
   if(!url)throw new Error('affiliate_endpoint_missing');
   // Re-delivery after a crash is safe only with the receiver's idempotency contract.
   if(process.env.AFFILIATE_WEBHOOK_IDEMPOTENT!=='true')throw new Error('affiliate_idempotency_contract_unverified');
   const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','idempotency-key':job.id},
     body:JSON.stringify({...job.payload,event_id:job.id}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error('affiliate_delivery_http_'+response.status);
   return;
 }
 if(job.kind==='return_refunded') {
   await settleReturnEarnings(pool,job.aggregate_id);
   const row=(await pool.query('SELECT order_id,type,status,reason FROM return_request WHERE id=$1 AND deleted_at IS NULL',[job.aggregate_id])).rows[0];
   if(!row||row.status!=='refunded')throw new Error('return_receipt_state_mismatch');
   // Financial amounts and customer coins have already committed atomically.
   const latest=(await pool.query('SELECT id,type,status,reason FROM return_request WHERE order_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1',[row.order_id])).rows[0];
   const response=await updateOrderMetadata(row.order_id,{return_request_id:latest.id,return_request_type:latest.type,
     return_request_status:latest.status,return_request_reason:latest.reason,return_status_updated_at:new Date().toISOString()});
   if(!response.ok)throw new Error('return_metadata_sync_failed');
   return;
 }
 throw new Error('unknown_payment_work_kind');
}

export async function runPaymentWorkBatch(limit=10) {
 const pool=getPool();let completed=0,failed=0;
 for(let n=0;n<Math.min(20,Math.max(1,limit));n++) {
   const job=await claimPaymentWork(pool);if(!job)break;
   try {await handleWork(job);await finishPaymentWork(pool,job);completed++;}
   catch(error){await finishPaymentWork(pool,job,error instanceof Error?error.message:'work_failed');failed++;}
 }
 return {completed,failed};
}

/** Polling repairs captures even if the browser and webhook process both died. */
export async function reconcileUnrecordedCaptures(limit=5) {
 const pool=getPool();
 const orders=(await pool.query(`WITH due AS (
   SELECT order_id FROM checkout_capture_watch WHERE state='pending' AND next_check_at<=now()
   ORDER BY next_check_at FOR UPDATE SKIP LOCKED LIMIT $1
 ) UPDATE checkout_capture_watch w SET next_check_at=now()+interval '5 minutes'
   FROM due WHERE w.order_id=due.order_id RETURNING w.order_id AS id,w.gateway_order_id,w.created_at`,[limit])).rows;
 let recovered=0,failed=0;
 for(const order of orders) {
   try {
     const payments=await fetchRazorpayOrderPayments(order.gateway_order_id);
     for(const payment of payments.filter(p=>p.status==='captured')) {
       const result=await recoverRazorpayCapture({medusaOrderId:order.id,razorpayPaymentId:payment.id,razorpayOrderId:order.gateway_order_id});
       if(!result.ok)throw new Error('captured_payment_needs_reconciliation');recovered++;
     }
     // Expire only idle/unpaid checkout holds; authorized or processing bank attempts retain theirs.
     if(payments.every(p=>p.status==='failed') && Date.now()-new Date(order.created_at).getTime()>45*60*1000) {
       const result=await markCheckoutPaymentFailed(order.id);
       if(!result.recovered)await releaseCheckoutCoins(pool,order.id);
     }
     await pool.query(`UPDATE checkout_capture_watch SET last_checked_at=now(),last_error=NULL,
       next_check_at=now()+CASE WHEN created_at>now()-interval '1 hour' THEN interval '30 seconds' ELSE interval '15 minutes' END WHERE order_id=$1`,[order.id]);
   }catch{failed++;await pool.query("UPDATE checkout_capture_watch SET last_error='capture_reconciliation_failed',last_checked_at=now() WHERE order_id=$1",[order.id]);}
 }
 // Repair the small conversion→COD metadata/outbox window without executing effects twice.
 await pool.query(`INSERT INTO payment_work(id,kind,aggregate_id)
   SELECT 'payment_paid:'||id,'payment_paid',id FROM "order" WHERE deleted_at IS NULL AND is_draft_order=false
     AND (metadata->>'razorpay_payment_status'='captured' OR metadata->>'cod_status'='confirmed')
     AND metadata->>'payment_reliability_version'='1'
     AND created_at>now()-interval '30 days' ON CONFLICT DO NOTHING`);
 const idle=(await pool.query(`SELECT h.order_id FROM checkout_coin_reservation h JOIN "order" o ON o.id=h.order_id
   WHERE h.state='held' AND h.created_at<now()-interval '45 minutes'
     AND o.metadata->>'razorpay_order_id' IS NULL AND COALESCE(o.metadata->>'cod_status','')<>'confirmed' LIMIT 10`)).rows;
 for(const hold of idle){const result=await markCheckoutPaymentFailed(hold.order_id);if(!result.recovered)await releaseCheckoutCoins(pool,hold.order_id);}
 return {checked:orders.length,recovered,failed};
}
