import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { getSharedDbPool } from "../../../../../lib/db-pool"
import { recordManualReturnRefund } from "../../../../../lib/return-financial-settlement"

export async function POST(req:MedusaRequest,res:MedusaResponse) {
 const body=(req.body||{}) as {payout_reference?:string;cash_minor?:number}
 const auth=(req as MedusaRequest & {auth_context?:{actor_id?:string;actor_type?:string}}).auth_context
 const actorId=auth?.actor_id
 if(!actorId||auth?.actor_type!=='user')return res.status(401).json({message:"Admin session required"})
 const pool=getSharedDbPool()
 try {
   const receipt=await recordManualReturnRefund(pool,{returnId:req.params.id,actorId,
     payoutReference:body.payout_reference||"",cashMinor:body.cash_minor as number})
   return res.json({refund_receipt:receipt,synchronization_queued:true})
 }catch(error){
   const code=error instanceof Error?error.message:"refund_failed"
   const expected=/^(invalid_|return_|refund_|legacy_|coin_)/.test(code)
   return res.status(expected?409:503).json({message:expected?code:"Refund could not be recorded. Retry with the same payout reference; do not transfer money again."})
 }
}
