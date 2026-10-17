import type { Pool } from "pg";
import { consumeCheckoutCoins, enqueuePaymentWork,freezePaidOrderItems } from "@/lib/payment-reliability";

export type CaptureInput = {
  orderId: string;
  amountMinor: number;
  currencyCode: string;
  razorpayPaymentId: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
  reconciledAt?: string;
};

/** A conditional row update re-checks paid state after a concurrent capture releases its lock. */
export async function stampCheckoutFailure(pool: Pool, orderId: string, metadata: Record<string, unknown>, terminal = false) {
  const result = await pool.query(
    `UPDATE "order" SET metadata=COALESCE(metadata,'{}'::jsonb)||$2::jsonb,updated_at=now()
     WHERE id=$1 AND deleted_at IS NULL
       AND COALESCE(metadata->>'razorpay_payment_status','') NOT IN ('captured','paid','authorized')
       AND COALESCE(metadata->>'cod_status','')<>'confirmed'
       AND ($3 OR (COALESCE(metadata->>'razorpay_payment_status','')<>'failed'
         AND COALESCE(metadata->>'checkout_status','')<>'payment_failed')) RETURNING id`,
    [orderId, JSON.stringify(metadata), terminal]
  );
  return Boolean(result.rowCount);
}

/** The caller must authenticate the gateway event before entering this boundary. */
export async function recordCaptureAtomically(pool: Pool, input: CaptureInput) {
  if (!input.orderId || !input.razorpayPaymentId || !input.razorpayOrderId ||
      !Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("invalid_capture_input");
  }
  const currency = input.currencyCode.toLowerCase();
  const major = (input.amountMinor / 100).toFixed(2);
  const raw = JSON.stringify({ value: major, precision: 20 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '20s'");
    // Transaction locks are held by this checked-out connection and released on rollback too.
    // Payment lock prevents the same capture being credited to two different orders.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["capture:" + input.razorpayPaymentId]);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["order-payment:" + input.orderId]);
    const order = (await client.query(
      'SELECT metadata,currency_code,is_draft_order,customer_id FROM "order" WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [input.orderId]
    )).rows[0];
    if (!order || order.is_draft_order) throw new Error("capture_requires_placed_order");
    const metadata = order.metadata || {};
    if (String(order.currency_code).toLowerCase() !== currency) throw new Error("capture_currency_mismatch");
    if (!metadata.razorpay_order_id || metadata.razorpay_order_id !== input.razorpayOrderId) throw new Error("capture_order_mismatch");
    if (metadata.razorpay_payment_id && metadata.razorpay_payment_status === "captured" && metadata.razorpay_payment_id !== input.razorpayPaymentId) {
      throw new Error("order_already_paid_by_another_payment");
    }
    const summary = (await client.query(
      "SELECT totals FROM order_summary WHERE order_id=$1 LIMIT 1 FOR UPDATE", [input.orderId]
    )).rows[0];
    if (!summary) throw new Error("order_summary_missing");
    const totals = summary.totals || {};
    const expected = Number(metadata.medusa_total_minor ?? metadata.razorpay_amount_minor ??
      Math.round(Number(totals.current_order_total ?? totals.original_order_total) * 100));
    if (!Number.isSafeInteger(expected) || expected <= 0 || expected !== input.amountMinor) throw new Error("capture_amount_mismatch");
    await consumeCheckoutCoins(client,{orderId:input.orderId,customerId:order.customer_id,metadata});
    if(metadata.payment_reliability_version===1)await freezePaidOrderItems(client,{orderId:input.orderId,cashMinor:input.amountMinor,
      coinMinor:Number(metadata.coin_discount_minor||0),shippingMinor:Math.round(Number(metadata.expected_shipping_price||0)*100)});

    const existing = await client.query(
      `SELECT p.id,p.amount,p.currency_code,p.payment_collection_id,opc.order_id
       FROM payment p JOIN order_payment_collection opc ON opc.payment_collection_id=p.payment_collection_id
       WHERE p.deleted_at IS NULL AND opc.deleted_at IS NULL
         AND (p.data->>'razorpay_payment_id'=$1 OR p.data #>> '{data,razorpay_payment_id}'=$1)`,
      [input.razorpayPaymentId]
    );
    if (existing.rows.some(row => row.order_id !== input.orderId)) throw new Error("capture_already_used_for_another_order");
    const existingPayment = existing.rows[0];
    if (existingPayment && (Math.round(Number(existingPayment.amount) * 100) !== input.amountMinor || String(existingPayment.currency_code).toLowerCase() !== currency)) {
      throw new Error("stored_capture_mismatch");
    }
    const otherCapture = await client.query(
      `SELECT p.id FROM payment p JOIN order_payment_collection opc ON opc.payment_collection_id=p.payment_collection_id
       WHERE opc.order_id=$1 AND opc.deleted_at IS NULL AND p.deleted_at IS NULL AND p.captured_at IS NOT NULL
         AND p.id<>COALESCE($2, '') LIMIT 1`, [input.orderId, existingPayment?.id || null]
    );
    if (otherCapture.rows.length) throw new Error("order_already_has_another_capture");

    let collectionId = existingPayment?.payment_collection_id;
    if (!collectionId) collectionId = (await client.query(
      "SELECT payment_collection_id FROM order_payment_collection WHERE order_id=$1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1", [input.orderId]
    )).rows[0]?.payment_collection_id;
    if (!collectionId) {
      collectionId = (await client.query(
        `INSERT INTO payment_collection (id,currency_code,amount,raw_amount,captured_amount,raw_captured_amount,status,metadata,created_at,updated_at)
         VALUES ('pay_col_'||replace(gen_random_uuid()::text,'-',''),$1,$2,$3,$2,$3,'completed',$4,now(),now()) RETURNING id`,
        [currency, major, raw, JSON.stringify(metadata.cart_id ? { cart_id: metadata.cart_id } : {})]
      )).rows[0].id;
      await client.query(
        `INSERT INTO order_payment_collection (id,order_id,payment_collection_id,created_at,updated_at)
         VALUES ('ordpaycol_'||replace(gen_random_uuid()::text,'-',''),$1,$2,now(),now())`, [input.orderId, collectionId]
      );
    }
    const captureData = JSON.stringify({ status: "captured", captured: true, amount_in_paise: input.amountMinor,
      razorpay_payment_id: input.razorpayPaymentId, razorpay_order_id: input.razorpayOrderId,
      razorpay_signature: input.razorpaySignature });
    let paymentId = existingPayment?.id;
    if (!existingPayment) {
      const sessionId = (await client.query(
        `INSERT INTO payment_session (id,currency_code,amount,raw_amount,provider_id,data,context,status,payment_collection_id,created_at,updated_at)
         VALUES ('payses_'||replace(gen_random_uuid()::text,'-',''),$1,$2,$3,'razorpay',$4,$5,'captured',$6,now(),now()) RETURNING id`,
        [currency, major, raw, captureData, JSON.stringify({ cart_id: metadata.cart_id || null }), collectionId]
      )).rows[0].id;
      paymentId = (await client.query(
        `INSERT INTO payment (id,amount,raw_amount,currency_code,provider_id,data,payment_collection_id,payment_session_id,captured_at,created_at,updated_at)
         VALUES ('pay_'||replace(gen_random_uuid()::text,'-',''),$1,$2,$3,'razorpay',$4,$5,$6,now(),now(),now()) RETURNING id`,
        [major, raw, currency, captureData, collectionId, sessionId]
      )).rows[0].id;
    }
    const captures = await client.query("SELECT id,amount FROM capture WHERE payment_id=$1 AND deleted_at IS NULL", [paymentId]);
    if (captures.rows.length > 1 || captures.rows.some(row => Math.round(Number(row.amount)*100) !== input.amountMinor)) throw new Error("stored_capture_record_mismatch");
    if (!captures.rows.length) await client.query(
      `INSERT INTO capture (id,amount,raw_amount,payment_id,metadata,created_at,updated_at)
       VALUES ('capt_'||replace(gen_random_uuid()::text,'-',''),$1,$2,$3,$4,now(),now())`,
      [major,raw,paymentId,JSON.stringify({razorpay_payment_id:input.razorpayPaymentId})]
    );
    await client.query(
      `UPDATE payment_collection SET captured_amount=$1,raw_captured_amount=$2,status='completed',updated_at=now() WHERE id=$3`,
      [major, raw, collectionId]
    );
    const existingTx = await client.query(
      "SELECT id,amount FROM order_transaction WHERE order_id=$1 AND reference_id=$2 AND deleted_at IS NULL", [input.orderId, input.razorpayPaymentId]
    );
    if (existingTx.rows.length > 1 || existingTx.rows.some(row => Math.round(Number(row.amount) * 100) !== input.amountMinor)) throw new Error("stored_accounting_mismatch");
    if (!existingTx.rows.length) await client.query(
      `INSERT INTO order_transaction (id,order_id,version,amount,raw_amount,currency_code,reference,reference_id,created_at,updated_at)
       VALUES ('ordtr_'||replace(gen_random_uuid()::text,'-',''),$1,1,$2,$3,$4,'capture',$5,now(),now())`,
      [input.orderId, major, raw, currency, input.razorpayPaymentId]
    );
    const paid = Number((await client.query(
      "SELECT COALESCE(SUM(amount),0)::text AS paid FROM order_transaction WHERE order_id=$1 AND deleted_at IS NULL", [input.orderId]
    )).rows[0].paid);
    if (Math.round(paid * 100) !== input.amountMinor) throw new Error("accounting_total_mismatch");
    const orderTotal = Number(totals.current_order_total ?? totals.original_order_total ?? major);
    const pending = Math.max(0, Math.round((orderTotal - paid) * 100) / 100);
    await client.query("UPDATE order_summary SET totals=$1,updated_at=now() WHERE order_id=$2", [JSON.stringify({ ...totals,
      paid_total: paid, raw_paid_total: { value: String(paid), precision: 20 },
      transaction_total: paid, raw_transaction_total: { value: String(paid), precision: 20 },
      pending_difference: pending, raw_pending_difference: { value: String(pending), precision: 20 }
    }), input.orderId]);
    await client.query('UPDATE "order" SET metadata=COALESCE(metadata,\'{}\'::jsonb)||$2::jsonb,updated_at=now() WHERE id=$1', [input.orderId, JSON.stringify({
      payment_method: "razorpay", checkout_status: "paid", razorpay_payment_status: "captured",
      checkout_tombstone: false, checkout_failed_at: null,
      razorpay_payment_id: input.razorpayPaymentId, razorpay_order_id: input.razorpayOrderId,
      razorpay_signature: input.razorpaySignature, razorpay_amount_minor: input.amountMinor,
      medusa_total_minor: input.amountMinor, razorpay_capture_status: "captured", razorpay_admin_reconcile_required: false,
      ...(input.reconciledAt ? { razorpay_reconciled_at: input.reconciledAt } : {})
    })]);
    // Historic captures may already have dispatched commissions before the outbox existed.
    if(!existingPayment || metadata.payment_reliability_version===1) {
      await enqueuePaymentWork(client,"payment_paid",input.orderId);
      await client.query(`UPDATE "order" SET metadata=metadata||'{"payment_reliability_version":1}'::jsonb WHERE id=$1`,[input.orderId]);
    }
    await client.query("UPDATE checkout_capture_watch SET state='captured',last_checked_at=now(),last_error=NULL WHERE gateway_order_id=$1",[input.razorpayOrderId]);
    await client.query("COMMIT");
    return { ok: true, paymentCreated: true, transactionCreated: true, skipped: Boolean(existingPayment), reason: existingPayment ? "duplicate_razorpay_payment" : undefined };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
