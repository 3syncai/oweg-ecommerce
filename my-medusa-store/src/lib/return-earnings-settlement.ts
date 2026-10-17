import type {Pool,PoolClient} from "pg"
import {lockWallet,transaction} from "./payment-reliability"

async function adjustment(client:PoolClient,input:{returnId:string;kind:string;targetId:string;base:number;returned:number;prior:number;total:number}) {
 const previous=(await client.query("SELECT return_id,base_minor,amount_minor FROM return_target_adjustment WHERE target_kind=$1 AND target_id=$2",[input.kind,input.targetId])).rows
 if(previous.some(r=>r.return_id===input.returnId))return 0
 const base=Number(previous[0]?.base_minor??input.base)
 const delta=Number(BigInt(base)*BigInt(input.prior+input.returned)/BigInt(input.total)-BigInt(base)*BigInt(input.prior)/BigInt(input.total))
 await client.query(`INSERT INTO return_target_adjustment(return_id,target_kind,target_id,base_minor,amount_minor)
   VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,[input.returnId,input.kind,input.targetId,base,delta])
 return delta
}

/** Scope customer referral and vendor deductions to the returned products, including partial quantities. */
export async function settleReturnEarnings(pool:Pool,returnId:string) {
 return transaction(pool,async client=>{
   const receipt=(await client.query("SELECT * FROM return_financial_settlement WHERE return_id=$1",[returnId])).rows[0]
   if(!receipt)throw new Error("return_receipt_missing")
   await client.query('SELECT id FROM "order" WHERE id=$1 FOR UPDATE',[receipt.order_id])
   const frozen=(await client.query('SELECT item_id AS id,product_id,vendor_id,basis_minor AS basis FROM payment_order_item_snapshot WHERE order_id=$1',[receipt.order_id])).rows
   const lines=frozen.length?frozen:(await client.query(`SELECT DISTINCT ON(oli.id) oli.id,COALESCE(oli.product_id,pv.product_id) AS product_id,
     p.metadata->>'vendor_id' AS vendor_id,round(oli.unit_price::numeric*100)*oi.quantity AS basis
     FROM order_item oi JOIN order_line_item oli ON oli.id=oi.item_id
     LEFT JOIN product_variant pv ON pv.id=oli.variant_id LEFT JOIN product p ON p.id=COALESCE(oli.product_id,pv.product_id)
     WHERE oi.order_id=$1 AND oi.deleted_at IS NULL ORDER BY oli.id,oi.version DESC`,[receipt.order_id])).rows
   const returned=(await client.query(`SELECT a->>'item_id' AS item_id,
     SUM(CASE WHEN s.return_id=$2 THEN (a->>'basis_minor')::numeric ELSE 0 END) AS basis,
     SUM(CASE WHEN (s.created_at,s.return_id)<($3::timestamptz,$2::text) THEN (a->>'basis_minor')::numeric ELSE 0 END) AS prior
     FROM return_financial_settlement s CROSS JOIN LATERAL jsonb_array_elements(s.allocations) a
     WHERE s.order_id=$1 GROUP BY a->>'item_id'`,[receipt.order_id,returnId,receipt.created_at])).rows
   const basisFor=(kind:'product_id'|'vendor_id',id:string)=>{
     const selected=lines.filter(l=>l[kind]===id)
     return {total:selected.reduce((n,l)=>n+Number(l.basis),0),returned:selected.reduce((n,l)=>n+Number(returned.find(r=>r.item_id===l.id)?.basis||0),0),prior:selected.reduce((n,l)=>n+Number(returned.find(r=>r.item_id===l.id)?.prior||0),0)}
   }
   const logs=(await client.query("SELECT * FROM customer_referrer_coins_log WHERE order_id=$1 ORDER BY affiliate_customer_id,id FOR UPDATE",[receipt.order_id])).rows
   for(const log of logs) {
     if(!['PENDING','EARNED'].includes(log.status)||!log.product_id)continue
     const basis=basisFor('product_id',log.product_id);if(!basis.total||!basis.returned)continue
     const amount=await adjustment(client,{returnId,kind:'referral',targetId:String(log.id),base:Math.round(Number(log.coins)*100),...basis})
     if(!amount)continue
     const next=Math.max(0,Math.round(Number(log.coins)*100)-amount)
     if(log.status==='EARNED') {
       await lockWallet(client,log.affiliate_customer_id)
       await client.query(`INSERT INTO wallet_ledger(customer_id,order_id,type,amount,idempotency_key,metadata)
         VALUES($1,$2,'REVERSE',$3,$4,$5)`,[log.affiliate_customer_id,receipt.order_id,-amount,`return-referrer:${returnId}:${log.id}`,JSON.stringify({source:'customer_referrer',return_id:returnId,log_id:log.id})])
       await client.query("UPDATE wallet_account SET actual_balance=actual_balance-$1,updated_at=now() WHERE customer_id=$2",[amount,log.affiliate_customer_id])
     }
     await client.query(`UPDATE customer_referrer_coins_log SET coins=$2,status=$3 WHERE id=$1`,[log.id,next/100,next?log.status:log.status==='EARNED'?'REVERSED':'CANCELLED'])
     const column=log.status==='PENDING'?'pending_coins':'earned_coins'
     await client.query(`UPDATE customer_referrer SET ${column}=GREATEST(0,COALESCE(${column},0)-$1),updated_at=now() WHERE customer_id=$2`,[amount/100,log.affiliate_customer_id])
     if(log.status==='EARNED')await client.query(`UPDATE customer_referrer_referrals SET coins_earned=GREATEST(0,COALESCE(coins_earned,0)-$1)
       WHERE refer_code=$2 AND referred_customer_id=$3`,[amount/100,log.refer_code,log.referred_customer_id])
   }
   const vendors=(await client.query("SELECT * FROM vendor_earnings_log WHERE order_id=$1 ORDER BY vendor_id FOR UPDATE",[receipt.order_id])).rows
   for(const vendor of vendors) {
     if(vendor.status==='REVERSED'||Number(vendor.net_amount)<=0)continue
     const basis=basisFor('vendor_id',vendor.vendor_id);if(!basis.total||!basis.returned)continue
     const amount=await adjustment(client,{returnId,kind:'vendor',targetId:String(vendor.id),base:Math.round(Number(vendor.net_amount)*100),...basis})
     if(!amount)continue
     // Keep the original sale intact. A separate debit also works after the sale was paid out.
     await client.query(`INSERT INTO vendor_earnings_log
       SELECT (jsonb_populate_record(NULL::vendor_earnings_log,to_jsonb(v)||jsonb_build_object(
         'id',$2::text,'order_id',$3::text,'gross_amount',0,'taxable_amount',0,'gst_amount',0,
         'commission_amount',0,'tcs_amount',0,'tds_amount',0,'logistic_fee',0,'return_fee',0,
         'platform_fee',0,'platform_gst',0,'partner_commission',0,'partner_gst',0,'commission_gst',0,
         'logistic_gst',0,'listing_gst',0,'listing_total',0,'cancellation_fee',0,
         'customer_shipping_fee',0,'customer_shipping_gst',0,'customer_shipping_total',0,
         'net_amount',$4::numeric,'status','CREDITED','credited_at',now(),'unlock_at',NULL,'created_at',now(),'updated_at',now()))).*
       FROM vendor_earnings_log v WHERE v.id=$1 ON CONFLICT DO NOTHING`,[vendor.id,`vereturn_${returnId}_${vendor.vendor_id}`,`clawback:return:${returnId}`,-amount/100])
   }
   // Keep holds while any sibling return is unresolved. Never unlock a different order.
   await client.query(`UPDATE vendor_earnings_log SET status='CREDITED',credited_at=now(),updated_at=now()
     WHERE order_id=$1 AND status='ON_HOLD' AND NOT EXISTS(
       SELECT 1 FROM return_request WHERE order_id=$1 AND deleted_at IS NULL AND status IN('pending_approval','approved','pickup_initiated','picked_up','received'))`,[receipt.order_id])
 })
}
