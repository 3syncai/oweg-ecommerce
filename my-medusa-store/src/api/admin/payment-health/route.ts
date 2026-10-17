import type {AuthenticatedMedusaRequest,MedusaResponse} from "@medusajs/framework/http"
import {requireSuperadmin} from "../../../lib/admin-access/repository"
import {getSharedDbPool} from "../../../lib/db-pool"

export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse) {
 await requireSuperadmin(req.auth_context.actor_id)
 const pool=getSharedDbPool()
 res.setHeader('Cache-Control','no-store')
 const [summary,jobs,holds,receipts,worker,watches]=await Promise.all([
   pool.query("SELECT state,count(*)::int AS count,min(created_at) AS oldest FROM payment_work GROUP BY state"),
   pool.query("SELECT id,kind,aggregate_id,state,attempts,last_error,available_at,leased_until,updated_at FROM payment_work WHERE state<>'done' ORDER BY CASE WHEN state='dead' THEN 0 ELSE 1 END,created_at LIMIT 100"),
   pool.query("SELECT id,order_id,amount_minor,created_at FROM checkout_coin_reservation WHERE state='held' ORDER BY created_at LIMIT 50"),
   pool.query("SELECT return_id,order_id,actor_id,cash_minor,coin_minor,created_at FROM return_financial_settlement ORDER BY created_at DESC LIMIT 25"),
   pool.query("SELECT last_started_at,last_finished_at,last_error FROM payment_worker_status WHERE id='checkout'"),
   pool.query("SELECT order_id,last_error,last_checked_at FROM checkout_capture_watch WHERE state='pending' AND last_error IS NOT NULL ORDER BY last_checked_at LIMIT 50"),
 ])
 return res.json({summary:summary.rows,jobs:jobs.rows,holds:holds.rows,receipts:receipts.rows,worker:worker.rows[0]||null,capture_issues:watches.rows})
}

export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse) {
 await requireSuperadmin(req.auth_context.actor_id)
 const body=req.body as {job_id?:unknown}
 if(typeof body?.job_id!=='string'||body.job_id.length>300)return res.status(400).json({message:'job_id required'})
 const result=await getSharedDbPool().query(`WITH original AS(SELECT id,attempts FROM payment_work WHERE id=$1 AND state='dead' FOR UPDATE),
   reset AS(UPDATE payment_work w SET state='pending',attempts=0,available_at=now(),last_error=NULL,lease_token=NULL,leased_until=NULL,updated_at=now()
     FROM original o WHERE w.id=o.id RETURNING w.id,o.attempts)
   INSERT INTO payment_work_retry_audit(job_id,actor_id,previous_attempts) SELECT id,$2,attempts FROM reset RETURNING job_id`,[body.job_id,req.auth_context.actor_id])
 return res.status(result.rowCount?200:409).json({retried:Boolean(result.rowCount)})
}
