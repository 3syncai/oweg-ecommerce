import { Pool } from "pg"
import { PAYMENT_RELIABILITY_SCHEMA } from "../lib/payment-reliability"

export default async function installPaymentReliability() {
 if(!process.env.DATABASE_URL) throw new Error("DATABASE_URL required")
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL.includes('rds.amazonaws.com')?{rejectUnauthorized:false}:undefined})
 const client=await pool.connect()
 try {await client.query("BEGIN");await client.query("SELECT pg_advisory_xact_lock(hashtext('install-payment-reliability-v1'))");
   await client.query(PAYMENT_RELIABILITY_SCHEMA);await client.query("COMMIT");console.log("Payment reliability schema installed (additive, idempotent).")
 }catch(error){await client.query("ROLLBACK");throw error}finally{client.release();await pool.end()}
}
