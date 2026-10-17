import type {Pool} from "pg"
import {lockWallet,transaction} from "./payment-reliability"

/** Serialize delivery credit with item-level return reversal and commit both balance and status. */
export async function creditReferralCoinsForOrder(pool:Pool,orderId:string) {
 return transaction(pool,async client=>{
   await client.query('SELECT id FROM "order" WHERE id=$1 FOR UPDATE',[orderId])
   const rows=(await client.query("SELECT * FROM customer_referrer_coins_log WHERE order_id=$1 AND status='PENDING' ORDER BY affiliate_customer_id,id FOR UPDATE",[orderId])).rows
   let creditedTotal=0,credited=0,affiliateCustomerId:string|undefined
   for(const row of rows) {
     const amount=Math.round(Number(row.coins)*100)
     if(!amount)continue
     await lockWallet(client,row.affiliate_customer_id)
     const key=`customer-referrer:${row.id}`
     const prior=(await client.query("SELECT customer_id,amount FROM wallet_ledger WHERE idempotency_key=$1",[key])).rows[0]
     if(prior&&(Number(prior.amount)!==amount||prior.customer_id!==row.affiliate_customer_id))throw new Error("referral_credit_requires_reconciliation")
     if(!prior) {
       await client.query(`INSERT INTO wallet_ledger(customer_id,type,amount,reference_id,idempotency_key,metadata) VALUES($1,'EARN',$2,$3,$3,$4)`,[row.affiliate_customer_id,amount,key,JSON.stringify({source:'customer_referrer',order_id:orderId,log_id:row.id,refer_code:row.refer_code})])
       await client.query("UPDATE wallet_account SET actual_balance=actual_balance+$1,updated_at=now() WHERE customer_id=$2",[amount,row.affiliate_customer_id])
     }
     await client.query("UPDATE customer_referrer_coins_log SET status='EARNED',unlocked_at=now() WHERE id=$1",[row.id])
     await client.query(`UPDATE customer_referrer SET pending_coins=GREATEST(0,COALESCE(pending_coins,0)-$1),
       earned_coins=COALESCE(earned_coins,0)+$1,updated_at=now() WHERE customer_id=$2`,[amount/100,row.affiliate_customer_id])
     await client.query("UPDATE customer_referrer_referrals SET coins_earned=COALESCE(coins_earned,0)+$1 WHERE refer_code=$2 AND referred_customer_id=$3",[amount/100,row.refer_code,row.referred_customer_id])
     creditedTotal+=amount/100;credited++;affiliateCustomerId=row.affiliate_customer_id
   }
   return {skipped:!credited,credited_total:creditedTotal,entries_credited:credited,affiliate_customer_id:affiliateCustomerId}
 })
}
