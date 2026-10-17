import type { Pool, PoolClient } from "pg"
import { allocateMinor, enqueuePaymentWork, lockWallet, transaction } from "./payment-reliability"

type Allocation={item_id:string;quantity:number;basis_minor:number;coin_minor:number;cash_minor:number}
export type ReturnQuote={return_id:string;order_id:string;cash_minor:number;coin_minor:number;allocations:Allocation[];already_recorded:boolean;payout_reference?:string}

export async function quoteReturnSettlement(client:PoolClient, returnId:string):Promise<ReturnQuote> {
 const request=(await client.query("SELECT * FROM return_request WHERE id=$1 AND deleted_at IS NULL",[returnId])).rows[0]
 if(!request || request.type!=='return') throw new Error("return_request_not_found")
 const order=(await client.query('SELECT * FROM "order" WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[request.order_id])).rows[0]
 if(!order)throw new Error("return_order_not_found")
 const receipt=(await client.query("SELECT * FROM return_financial_settlement WHERE return_id=$1",[returnId])).rows[0]
 if(receipt)return {...receipt,return_id:returnId,cash_minor:Number(receipt.cash_minor),coin_minor:Number(receipt.coin_minor),already_recorded:true}
 if(request.status==='refunded')throw new Error("legacy_refund_requires_receipt_reconciliation")
 if(!['received','picked_up'].includes(request.status))throw new Error("return_not_received")
 const frozen=(await client.query('SELECT item_id AS id,order_item_id,quantity,basis_minor,cash_minor,coin_minor FROM payment_order_item_snapshot WHERE order_id=$1 ORDER BY item_id',[order.id])).rows
 const lines=frozen.length?frozen.map(l=>({...l,unit_minor:Number(l.basis_minor)/Number(l.quantity)})):(await client.query(`SELECT DISTINCT ON(oli.id) oli.id,oi.id AS order_item_id,oi.quantity,
   round(oli.unit_price::numeric*100)::bigint AS unit_minor
   FROM order_item oi JOIN order_line_item oli ON oli.id=oi.item_id
   WHERE oi.order_id=$1 AND oi.deleted_at IS NULL AND oli.deleted_at IS NULL ORDER BY oli.id,oi.version DESC`,[order.id])).rows
 if(!lines.length || lines.some(l=>!Number.isSafeInteger(Number(l.quantity))||Number(l.quantity)<=0))throw new Error("invalid_order_quantities")
 const weights=lines.map(l=>({id:String(l.id),weight:Number(l.unit_minor)*Number(l.quantity)}))
 const totalBasis=weights.reduce((n,l)=>n+l.weight,0)
 const spend=Number((await client.query("SELECT COALESCE(SUM(-amount),0) AS n FROM wallet_ledger WHERE order_id=$1 AND customer_id=$2 AND type='SPEND'",[order.id,order.customer_id])).rows[0].n)
 if((frozen.length?frozen.reduce((n,l)=>n+Number(l.coin_minor),0):Number(order.metadata?.coin_discount_minor||0))!==spend)throw new Error("coin_discount_not_settled")
 const summary=(await client.query("SELECT totals FROM order_summary WHERE order_id=$1 ORDER BY version DESC LIMIT 1",[order.id])).rows[0]?.totals
 const paidMinor=frozen.length?frozen.reduce((n,l)=>n+Number(l.cash_minor),0):Number(order.metadata?.razorpay_amount_minor ?? Math.round(Number(summary?.current_order_total)*100))
 const shippingMinor=Math.round(Number(order.metadata?.expected_shipping_price||0)*100)
 if(!Number.isSafeInteger(paidMinor)||paidMinor<0||totalBasis<=0)throw new Error("refund_basis_unavailable")
 // Goods only: outward shipping is retained. Promotions and coins reduce cash independently.
 const cashBudget=Math.min(totalBasis,Math.max(0,paidMinor-shippingMinor))
 const coins=new Map(frozen.length?frozen.map(x=>[String(x.id),Number(x.coin_minor)] as [string,number]):allocateMinor(spend,weights).map(x=>[x.id,x.amount]))
 const cash=new Map(frozen.length?frozen.map(x=>[String(x.id),Number(x.cash_minor)] as [string,number]):allocateMinor(cashBudget,weights).map(x=>[x.id,x.amount]))
 const previous=(await client.query("SELECT allocations FROM return_financial_settlement WHERE order_id=$1",[order.id])).rows
 const returned=new Map<string,number>()
 for(const row of previous)for(const item of row.allocations as Allocation[]) returned.set(item.item_id,(returned.get(item.item_id)||0)+item.quantity)
 const requested=(await client.query("SELECT order_item_id,quantity FROM return_request_item WHERE return_request_id=$1 AND deleted_at IS NULL",[returnId])).rows
 if(!requested.length)throw new Error("return_items_missing")
 const selected=new Map<string,number>()
 for(const item of requested) {
   const line=lines.find(l=>l.id===item.order_item_id||l.order_item_id===item.order_item_id)
   const qty=Number(item.quantity)
   if(!line || !Number.isSafeInteger(qty)||qty<=0)throw new Error("invalid_return_item")
   selected.set(line.id,(selected.get(line.id)||0)+qty)
 }
 const allocations:Allocation[]=[]
 for(const [itemId,qty] of selected) {
   const line=lines.find(l=>l.id===itemId)!, prior=returned.get(itemId)||0, totalQty=Number(line.quantity)
   if(prior+qty>totalQty)throw new Error("return_quantity_exceeds_remaining")
   const portion=(budget:number)=>Number(BigInt(budget)*BigInt(prior+qty)/BigInt(totalQty)-BigInt(budget)*BigInt(prior)/BigInt(totalQty))
   allocations.push({item_id:itemId,quantity:qty,basis_minor:Number(line.unit_minor)*qty,coin_minor:portion(coins.get(itemId)||0),cash_minor:portion(cash.get(itemId)||0)})
 }
 return {return_id:returnId,order_id:order.id,cash_minor:allocations.reduce((n,x)=>n+x.cash_minor,0),coin_minor:allocations.reduce((n,x)=>n+x.coin_minor,0),allocations,already_recorded:false}
}

/** Manual payout acknowledgement + exact coin refund + immutable receipt + retry work, one commit. */
export async function recordManualReturnRefund(pool:Pool,input:{returnId:string;actorId:string;payoutReference:string;cashMinor:number}) {
 if(!input.actorId||!Number.isSafeInteger(input.cashMinor)||input.cashMinor<0||!/^[-A-Za-z0-9_./:]{4,120}$/.test(input.payoutReference))throw new Error("invalid_refund_receipt")
 return transaction(pool,async client=>{
   const quote=await quoteReturnSettlement(client,input.returnId)
   if(quote.already_recorded) {
     if(quote.payout_reference!==input.payoutReference||quote.cash_minor!==input.cashMinor)throw new Error("refund_receipt_conflict")
     return quote
   }
   if(quote.cash_minor!==input.cashMinor)throw new Error("refund_quote_changed")
   const order=(await client.query('SELECT customer_id FROM "order" WHERE id=$1',[quote.order_id])).rows[0]
   await lockWallet(client,order.customer_id)
   // Historical full-order credits must never be credited again by a partial return.
   const history=Number((await client.query(`SELECT COALESCE(SUM(amount),0) AS n FROM wallet_ledger WHERE customer_id=$1 AND type='EARN'
     AND (idempotency_key=$2 OR (metadata->>'order_id'=$3 AND (left(idempotency_key,7)='refund-' OR metadata->>'source'='return_settlement')))`,[order.customer_id,`refund:order:${quote.order_id}`,quote.order_id])).rows[0].n)
   const spent=Number((await client.query("SELECT COALESCE(SUM(-amount),0) AS n FROM wallet_ledger WHERE order_id=$1 AND type='SPEND'",[quote.order_id])).rows[0].n)
   if(history+quote.coin_minor>spent)throw new Error("legacy_coin_refund_requires_reconciliation")
   if(quote.coin_minor) {
     await client.query(`INSERT INTO wallet_ledger(customer_id,order_id,type,amount,reference_id,idempotency_key,metadata)
       VALUES($1,NULL,'EARN',$2,$3,$3,$4)`,[order.customer_id,quote.coin_minor,`refund:return:${quote.return_id}`,JSON.stringify({order_id:quote.order_id,return_id:quote.return_id,source:"return_settlement"})])
     await client.query("UPDATE wallet_account SET actual_balance=actual_balance+$1,updated_at=now() WHERE customer_id=$2",[quote.coin_minor,order.customer_id])
   }
   await client.query(`INSERT INTO return_financial_settlement(return_id,order_id,actor_id,payout_reference,cash_minor,coin_minor,allocations)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,[quote.return_id,quote.order_id,input.actorId,input.payoutReference,quote.cash_minor,quote.coin_minor,JSON.stringify(quote.allocations)])
   const earnings=(await client.query(`SELECT COALESCE(SUM(amount),0) AS actual,
     COALESCE(SUM(COALESCE((metadata->>'original_award_minor')::numeric,amount)),0) AS original
     FROM wallet_ledger WHERE customer_id=$1 AND order_id=$2 AND type='EARN'`,[order.customer_id,quote.order_id])).rows[0]
   const earned=Number(earnings.original)
   const totals=(await client.query(`SELECT
     COALESCE((SELECT SUM(basis_minor) FROM payment_order_item_snapshot WHERE order_id=$1),
     (SELECT SUM(round(oli.unit_price::numeric*100)*oi.quantity) FROM order_item oi JOIN order_line_item oli ON oli.id=oi.item_id WHERE oi.order_id=$1 AND oi.deleted_at IS NULL AND oli.deleted_at IS NULL)) AS basis,
     (SELECT COALESCE(SUM((a->>'basis_minor')::bigint),0) FROM return_financial_settlement s CROSS JOIN LATERAL jsonb_array_elements(s.allocations) a WHERE s.order_id=$1) AS returned,
     (SELECT COALESCE(SUM(-amount),0) FROM wallet_ledger WHERE order_id=$1 AND customer_id=$2 AND type='REVERSE') AS reversed`,[quote.order_id,order.customer_id])).rows[0]
   const target=Math.max(0,Number(BigInt(earned)*BigInt(totals.returned)/BigInt(totals.basis))-(earned-Number(earnings.actual)))
   const reversal=Math.max(0,target-Number(totals.reversed))
   if(reversal) {
     await client.query(`INSERT INTO wallet_ledger(customer_id,order_id,type,amount,idempotency_key,metadata) VALUES($1,$2,'REVERSE',$3,$4,$5)`,[order.customer_id,quote.order_id,-reversal,`return-earned:${quote.return_id}`,JSON.stringify({return_id:quote.return_id,reason:"partial_return"})])
     await client.query("UPDATE wallet_account SET actual_balance=actual_balance-$1,updated_at=now() WHERE customer_id=$2",[reversal,order.customer_id])
   }
   const updated=await client.query("UPDATE return_request SET status='refunded',refunded_at=now(),updated_at=now() WHERE id=$1 AND status IN ('picked_up','received')",[quote.return_id])
   if(updated.rowCount!==1)throw new Error("return_status_changed")
   await enqueuePaymentWork(client,"return_refunded",quote.return_id,{order_id:quote.order_id})
   return quote
 })
}
