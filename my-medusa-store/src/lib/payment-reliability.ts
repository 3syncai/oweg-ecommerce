import { randomUUID } from "node:crypto"
import type { Pool, PoolClient } from "pg"

// Shared by Medusa and the storefront. Install through the explicit deployment CLI.
export const PAYMENT_RELIABILITY_SCHEMA = `
CREATE TABLE IF NOT EXISTS checkout_coin_reservation (
 id text PRIMARY KEY, order_id text NOT NULL UNIQUE, customer_id text NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 state text NOT NULL CHECK(state IN ('held','consumed','released')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_order_item_snapshot (
 order_id text NOT NULL,item_id text NOT NULL,order_item_id text NOT NULL,quantity integer NOT NULL CHECK(quantity>0),
 basis_minor bigint NOT NULL CHECK(basis_minor>=0),cash_minor bigint NOT NULL CHECK(cash_minor>=0),coin_minor bigint NOT NULL CHECK(coin_minor>=0),
 product_id text,vendor_id text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(order_id,item_id)
);
CREATE INDEX IF NOT EXISTS checkout_coin_reservation_customer ON checkout_coin_reservation(customer_id) WHERE state='held';
CREATE TABLE IF NOT EXISTS payment_work (
 id text PRIMARY KEY, kind text NOT NULL, aggregate_id text NOT NULL, payload jsonb NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','working','done','dead')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 lease_token text, leased_until timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(kind,aggregate_id)
);
CREATE INDEX IF NOT EXISTS payment_work_due ON payment_work(state,available_at);
CREATE TABLE IF NOT EXISTS payment_worker_status(id text PRIMARY KEY,last_started_at timestamptz,last_finished_at timestamptz,last_error text);
CREATE TABLE IF NOT EXISTS payment_work_attempt (
 id bigserial PRIMARY KEY,job_id text NOT NULL,attempt integer NOT NULL,lease_token text NOT NULL UNIQUE,
 started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,outcome text NOT NULL DEFAULT 'working',error_code text
);
CREATE TABLE IF NOT EXISTS payment_work_retry_audit (
 id bigserial PRIMARY KEY,job_id text NOT NULL,actor_id text NOT NULL,previous_attempts integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS return_financial_settlement (
 return_id text PRIMARY KEY, order_id text NOT NULL, actor_id text NOT NULL,
 payout_reference text NOT NULL, cash_minor bigint NOT NULL CHECK(cash_minor>=0),
 coin_minor bigint NOT NULL CHECK(coin_minor>=0), allocations jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS return_financial_payout_reference ON return_financial_settlement(payout_reference);
CREATE TABLE IF NOT EXISTS return_target_adjustment (
 return_id text NOT NULL, target_kind text NOT NULL, target_id text NOT NULL,
 base_minor bigint NOT NULL CHECK(base_minor>=0), amount_minor bigint NOT NULL CHECK(amount_minor>=0),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(return_id,target_kind,target_id)
);
CREATE TABLE IF NOT EXISTS checkout_capture_watch (
 order_id text PRIMARY KEY,gateway_order_id text NOT NULL UNIQUE,state text NOT NULL DEFAULT 'pending',
 next_check_at timestamptz NOT NULL DEFAULT now(),last_checked_at timestamptz,last_error text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS checkout_capture_watch_due ON checkout_capture_watch(next_check_at) WHERE state='pending';
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_idempotency_uq ON wallet_ledger(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_order_spend_uq ON wallet_ledger(order_id) WHERE type='SPEND' AND order_id IS NOT NULL;
CREATE OR REPLACE FUNCTION oweg_reject_refund_receipt_change() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Refund receipts are immutable; record a separate reconciliation adjustment'; END $$;
DROP TRIGGER IF EXISTS oweg_refund_receipt_immutable ON return_financial_settlement;
CREATE TRIGGER oweg_refund_receipt_immutable BEFORE UPDATE OR DELETE ON return_financial_settlement FOR EACH ROW EXECUTE FUNCTION oweg_reject_refund_receipt_change();
DROP TRIGGER IF EXISTS oweg_paid_snapshot_immutable ON payment_order_item_snapshot;
CREATE TRIGGER oweg_paid_snapshot_immutable BEFORE UPDATE OR DELETE ON payment_order_item_snapshot FOR EACH ROW EXECUTE FUNCTION oweg_reject_refund_receipt_change();
CREATE OR REPLACE FUNCTION oweg_guard_refunded_return() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN IF OLD.status='refunded' AND NEW.status<>'refunded' THEN RAISE EXCEPTION 'Refunded returns cannot change status'; END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS oweg_refunded_return_terminal ON return_request;
CREATE TRIGGER oweg_refunded_return_terminal BEFORE UPDATE ON return_request FOR EACH ROW EXECUTE FUNCTION oweg_guard_refunded_return();
`

export async function transaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
 const client=await pool.connect()
 try { await client.query("BEGIN"); await client.query("SET LOCAL lock_timeout='10s'");
   const value=await fn(client); await client.query("COMMIT"); return value
 } catch(error) { await client.query("ROLLBACK").catch(()=>undefined); throw error }
 finally { client.release() }
}

/** A live connection owns the lock; crashes release it without an expiring winner lease. */
export async function withPaymentCoordination<T>(pool:Pool,key:string,fn:()=>Promise<T>) {
 return transaction(pool,async client=>{
   await client.query("SET LOCAL statement_timeout='30s'")
   await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",['checkout-coordinate:'+key])
   return fn()
 })
}

export async function watchCheckoutCapture(pool:Pool,orderId:string,gatewayOrderId:string) {
 await pool.query(`INSERT INTO checkout_capture_watch(order_id,gateway_order_id) VALUES($1,$2)
   ON CONFLICT(order_id) DO UPDATE SET gateway_order_id=EXCLUDED.gateway_order_id,state='pending',next_check_at=now()
   WHERE checkout_capture_watch.state='pending'`,[orderId,gatewayOrderId])
}

function minor(value: number) {
 if(!Number.isSafeInteger(value)||value<=0) throw new Error("invalid_coin_amount")
 return value
}

export async function lockWallet(client: PoolClient, customerId: string) {
 await client.query("INSERT INTO wallet_account(customer_id,actual_balance) VALUES($1,0) ON CONFLICT DO NOTHING",[customerId])
 const row=(await client.query("SELECT actual_balance FROM wallet_account WHERE customer_id=$1 FOR UPDATE",[customerId])).rows[0]
 return Number(row.actual_balance)
}

export async function heldCoins(client: Pick<PoolClient,"query">, customerId: string, exceptId="") {
 return Number((await client.query("SELECT COALESCE(SUM(amount_minor),0) AS n FROM checkout_coin_reservation WHERE customer_id=$1 AND state='held' AND id<>$2",[customerId,exceptId])).rows[0].n)
}

export async function releaseCheckoutCoins(pool:Pool, orderId:string) {
 return transaction(pool,async client=>{
   const order=(await client.query('SELECT metadata FROM "order" WHERE id=$1 FOR UPDATE',[orderId])).rows[0]
   if(!order || ['captured','paid','authorized'].includes(String(order.metadata?.razorpay_payment_status)) || order.metadata?.cod_status==='confirmed') return false
   if(!order.metadata?.checkout_tombstone) return false
   const hold=(await client.query("SELECT * FROM checkout_coin_reservation WHERE order_id=$1 AND state='held'",[orderId])).rows[0]
   if(!hold)return false
   await lockWallet(client,hold.customer_id)
   return Boolean((await client.query("UPDATE checkout_coin_reservation SET state='released',updated_at=now() WHERE id=$1 AND state='held'",[hold.id])).rowCount)
 })
}

export async function reserveCheckoutCoins(pool: Pool, input: {orderId:string;customerId:string;amountMinor:number}) {
 minor(input.amountMinor)
 return transaction(pool,async client=>{
   // Lock order before wallet consistently with capture and cancellation.
   const order=(await client.query('SELECT customer_id,metadata FROM "order" WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[input.orderId])).rows[0]
   if(!order || order.customer_id!==input.customerId) throw new Error("coin_order_owner_mismatch")
   const balance=await lockWallet(client,input.customerId)
   const existing=(await client.query("SELECT * FROM checkout_coin_reservation WHERE order_id=$1",[input.orderId])).rows[0]
   if(existing) {
     if(existing.customer_id!==input.customerId||Number(existing.amount_minor)!==input.amountMinor||existing.state==='released') throw new Error("coin_reservation_conflict")
     return String(existing.id)
   }
   if(balance-await heldCoins(client,input.customerId)<input.amountMinor) throw new Error("insufficient_available_coins")
   const id="coinhold_"+randomUUID()
   await client.query("INSERT INTO checkout_coin_reservation(id,order_id,customer_id,amount_minor,state) VALUES($1,$2,$3,$4,'held')",[id,input.orderId,input.customerId,input.amountMinor])
   await client.query(`UPDATE "order" SET metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb WHERE id=$1`,[input.orderId,JSON.stringify({coin_reservation_id:id})])
   return id
 })
}

/** Called inside the capture transaction: debit the exact discount or roll everything back. */
export async function consumeCheckoutCoins(client: PoolClient, input: {orderId:string;customerId:string;metadata:Record<string,unknown>}) {
 const amount=Number(input.metadata.coin_discount_minor ?? Math.round(Number(input.metadata.coin_discount_rupees||0)*100))
 if(!amount) return {applied:false}
 minor(amount)
 if(!input.customerId) throw new Error("coin_customer_missing")
 const balance=await lockWallet(client,input.customerId)
 const prior=(await client.query("SELECT customer_id,amount FROM wallet_ledger WHERE order_id=$1 AND type='SPEND'",[input.orderId])).rows
 if(prior.length) {
   if(prior.length!==1||prior[0].customer_id!==input.customerId||Number(prior[0].amount)!==-amount) throw new Error("stored_coin_debit_mismatch")
   return {applied:false}
 }
 const holdId=String(input.metadata.coin_reservation_id||"")
 const hold=holdId?(await client.query("SELECT * FROM checkout_coin_reservation WHERE id=$1 FOR UPDATE",[holdId])).rows[0]:null
 if(holdId&&!hold)throw new Error("invalid_coin_reservation")
 const recoveredHold=hold&&input.metadata.recovered_from_snapshot===true&&input.metadata.original_medusa_order_id===hold.order_id
 if(hold && ((!recoveredHold&&hold.order_id!==input.orderId)||hold.customer_id!==input.customerId||Number(hold.amount_minor)!==amount||!['held','released'].includes(hold.state))) throw new Error("invalid_coin_reservation")
 // Legacy paid checkouts without a hold can settle only the full amount from unreserved funds.
 if(balance-await heldCoins(client,input.customerId,holdId)<amount) throw new Error("coin_settlement_requires_attention")
 await client.query(`INSERT INTO wallet_ledger(customer_id,order_id,type,amount,reference_id,idempotency_key,metadata)
   VALUES($1,$2,'SPEND',$3,$4,$5,$6)`,[input.customerId,input.orderId,-amount,`order:${input.orderId}`,`spend:order:${input.orderId}`,JSON.stringify({reason:"order_payment_confirmed",reservation_id:holdId||null})])
 await client.query("UPDATE wallet_account SET actual_balance=actual_balance-$1,updated_at=now() WHERE customer_id=$2",[amount,input.customerId])
 if(hold) await client.query("UPDATE checkout_coin_reservation SET state='consumed',order_id=$2,updated_at=now() WHERE id=$1",[holdId,input.orderId])
 await client.query(`UPDATE "order" SET metadata=COALESCE(metadata,'{}'::jsonb)||'{"coin_discount_spent":true,"coin_discount_capped":false}'::jsonb WHERE id=$1`,[input.orderId])
 return {applied:true}
}

export async function enqueuePaymentWork(client: Pick<PoolClient,"query">, kind:string, aggregateId:string, payload:Record<string,unknown>={}) {
 await client.query(`INSERT INTO payment_work(id,kind,aggregate_id,payload) VALUES($1,$2,$3,$4)
   ON CONFLICT DO NOTHING`,[`${kind}:${aggregateId}`,kind,aggregateId,JSON.stringify(payload)])
}

export type PaymentWork={id:string;kind:string;aggregate_id:string;payload:Record<string,unknown>;lease_token:string;attempts:number}
export async function claimPaymentWork(pool:Pool, leaseSeconds=120):Promise<PaymentWork|null> {
 await pool.query(`WITH exhausted AS (UPDATE payment_work SET state='dead',last_error='worker_lease_exhausted',lease_token=NULL,leased_until=NULL,updated_at=now()
   WHERE state='working' AND leased_until<now() AND attempts>=12 RETURNING id)
   UPDATE payment_work_attempt SET outcome='expired',finished_at=now(),error_code='worker_lease_exhausted'
   WHERE finished_at IS NULL AND job_id IN(SELECT id FROM exhausted)`)
 const token=randomUUID()
 const row=(await pool.query(`WITH candidate AS (
   SELECT id FROM payment_work WHERE
    (state='pending' AND available_at<=now()) OR (state='working' AND leased_until<now())
   ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
 ), claimed AS (UPDATE payment_work w SET state='working',attempts=attempts+1,lease_token=$1,
   leased_until=now()+$2*interval '1 second',updated_at=now()
 FROM candidate c WHERE w.id=c.id RETURNING w.*),
 logged AS (INSERT INTO payment_work_attempt(job_id,attempt,lease_token) SELECT id,attempts,lease_token FROM claimed RETURNING job_id),
 expired AS (UPDATE payment_work_attempt SET outcome='expired',finished_at=now() WHERE job_id IN(SELECT id FROM claimed) AND lease_token<>$1 AND finished_at IS NULL)
 SELECT c.* FROM claimed c JOIN logged l ON l.job_id=c.id`,[token,leaseSeconds])).rows[0]
 return row||null
}

/** Fencing token prevents an expired worker from acknowledging another worker's lease. */
export async function finishPaymentWork(pool:Pool, job:PaymentWork, errorCode?:string) {
 const result=await pool.query(`WITH finished AS (UPDATE payment_work SET state=$3,last_error=$4,
   available_at=now()+$5*interval '1 second',lease_token=NULL,leased_until=NULL,updated_at=now()
   WHERE id=$1 AND lease_token=$2 AND state='working' RETURNING id)
   UPDATE payment_work_attempt SET finished_at=now(),outcome=$3,error_code=$4 WHERE job_id IN(SELECT id FROM finished) AND lease_token=$2 RETURNING id`,[
   job.id,job.lease_token,errorCode?(job.attempts>=12?'dead':'pending'):'done',errorCode?.slice(0,160)||null,
   Math.min(3600,2**Math.min(job.attempts,11))])
 return Boolean(result.rowCount)
}

/** Integer largest-remainder allocation; totals remain exact to the paise. */
export function allocateMinor(total:number, weights:Array<{id:string;weight:number}>) {
 if(!Number.isSafeInteger(total)||total<0||!weights.length||weights.some(x=>!Number.isSafeInteger(x.weight)||x.weight<0)) throw new Error("invalid_allocation")
 const sum=weights.reduce((n,x)=>n+BigInt(x.weight),BigInt(0))
 if(sum===BigInt(0)) {if(total)throw new Error("zero_allocation_basis");return weights.map(x=>({id:x.id,amount:0}))}
 const rows=weights.map(x=>{const value=BigInt(total)*BigInt(x.weight);return {id:x.id,amount:Number(value/sum),remainder:value%sum}})
 let rest=total-rows.reduce((n,x)=>n+x.amount,0)
 const ranked=[...rows].sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):a.remainder>b.remainder?-1:1)
 for(const row of ranked) {if(rest--<=0)break;row.amount++}
 return rows.map(({id,amount})=>({id,amount}))
}

/** Capture-time allocations survive later catalogue, price, vendor and order metadata edits. */
export async function freezePaidOrderItems(client:PoolClient,input:{orderId:string;cashMinor:number;coinMinor:number;shippingMinor:number}) {
 if((await client.query("SELECT 1 FROM payment_order_item_snapshot WHERE order_id=$1 LIMIT 1",[input.orderId])).rows.length)return
 const lines=(await client.query(`SELECT oli.id,oi.id AS order_item_id,oi.quantity,round(oli.unit_price::numeric*100)*oi.quantity AS basis,
   COALESCE(oli.product_id,pv.product_id) AS product_id,p.metadata->>'vendor_id' AS vendor_id
   FROM order_item oi JOIN order_line_item oli ON oli.id=oi.item_id
   LEFT JOIN product_variant pv ON pv.id=oli.variant_id LEFT JOIN product p ON p.id=COALESCE(oli.product_id,pv.product_id)
   WHERE oi.order_id=$1 AND oi.deleted_at IS NULL AND oli.deleted_at IS NULL
     AND oi.version=(SELECT version FROM "order" WHERE id=$1) ORDER BY oli.id`,[input.orderId])).rows
 if(!lines.length||lines.some(l=>!Number.isSafeInteger(Number(l.quantity))||Number(l.quantity)<=0))throw new Error("paid_item_snapshot_invalid")
 const weights=lines.map(l=>({id:String(l.id),weight:Number(l.basis)}))
 const cash=allocateMinor(Math.max(0,input.cashMinor-input.shippingMinor),weights)
 const coins=allocateMinor(input.coinMinor,weights)
 for(const line of lines)await client.query(`INSERT INTO payment_order_item_snapshot(order_id,item_id,order_item_id,quantity,basis_minor,cash_minor,coin_minor,product_id,vendor_id)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[input.orderId,line.id,line.order_item_id,Number(line.quantity),Number(line.basis),cash.find(x=>x.id===line.id)!.amount,coins.find(x=>x.id===line.id)!.amount,line.product_id,line.vendor_id])
}
