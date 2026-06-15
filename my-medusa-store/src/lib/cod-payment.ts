import crypto from "crypto"
import { Pool } from "pg"

type MarkCodPaidResult =
  | { ok: true; paidTotal: number; orderId: string }
  | { ok: false; status: number; message: string }

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured")
  }
  return new Pool({ connectionString: process.env.DATABASE_URL })
}

async function orderHasDeliveredFulfillment(pool: Pool, orderId: string) {
  const result = await pool.query(
    `
      SELECT COUNT(*)::int AS count
      FROM order_fulfillment of
      JOIN fulfillment f ON f.id = of.fulfillment_id
      WHERE of.order_id = $1
        AND f.delivered_at IS NOT NULL
        AND f.deleted_at IS NULL
    `,
    [orderId]
  )
  return Number(result.rows[0]?.count || 0) > 0
}

async function createCodPaymentRecord(
  pool: Pool,
  payment: {
    order_id: string
    amountRupees: number
    currency_code: string
  }
) {
  const orderRes = await pool.query(
    `SELECT metadata->>'cart_id' AS cart_id FROM "order" WHERE id = $1`,
    [payment.order_id]
  )
  const cartId = orderRes.rows[0]?.cart_id as string | undefined
  const rawAmount = JSON.stringify({ amount: payment.amountRupees })

  const pcRes = await pool.query(
    `
      INSERT INTO payment_collection (
        id, currency_code, amount, raw_amount,
        captured_amount, raw_captured_amount,
        status, created_at, updated_at, metadata
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, 'completed', now(), now(), $6
      )
      RETURNING id
    `,
    [
      payment.currency_code.toLowerCase(),
      payment.amountRupees,
      rawAmount,
      payment.amountRupees,
      rawAmount,
      cartId ? JSON.stringify({ cart_id: cartId }) : "{}",
    ]
  )

  const paymentCollectionId = pcRes.rows[0].id as string

  await pool.query(
    `
      INSERT INTO order_payment_collection (id, order_id, payment_collection_id, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, now(), now())
      ON CONFLICT DO NOTHING
    `,
    [payment.order_id, paymentCollectionId]
  )

  const sessionRes = await pool.query(
    `
      INSERT INTO payment_session (
        id, currency_code, amount, raw_amount, provider_id,
        data, context, status, payment_collection_id,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, 'captured', $7, now(), now()
      )
      RETURNING id
    `,
    [
      payment.currency_code.toLowerCase(),
      payment.amountRupees,
      rawAmount,
      "pp_system_default",
      JSON.stringify({
        status: "captured",
        captured: true,
        payment_method: "cod",
        captured_at: new Date().toISOString(),
      }),
      JSON.stringify({ cart_id: cartId || null }),
      paymentCollectionId,
    ]
  )

  const paymentSessionId = sessionRes.rows[0].id as string

  await pool.query(
    `
      INSERT INTO payment (
        id, amount, raw_amount, currency_code, provider_id, data,
        payment_collection_id, payment_session_id,
        captured_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now(), now(), now()
      )
    `,
    [
      payment.amountRupees,
      rawAmount,
      payment.currency_code.toUpperCase(),
      "pp_system_default",
      JSON.stringify({
        status: "captured",
        captured: true,
        payment_method: "cod",
      }),
      paymentCollectionId,
      paymentSessionId,
    ]
  )

  return paymentCollectionId
}

async function createCodOrderTransaction(
  pool: Pool,
  transaction: {
    order_id: string
    amountRupees: number
    currency_code: string
    reference_id: string
  }
) {
  const rawAmount = JSON.stringify({
    value: String(transaction.amountRupees),
    precision: 20,
  })

  await pool.query(
    `
      INSERT INTO order_transaction (
        id, order_id, version, amount, raw_amount, currency_code,
        reference, reference_id,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, 1, $2, $3, $4, $5, $6, now(), now()
      )
    `,
    [
      transaction.order_id,
      transaction.amountRupees,
      rawAmount,
      transaction.currency_code.toLowerCase(),
      "capture",
      transaction.reference_id,
    ]
  )
}

async function syncOrderSummaryPaidTotal(pool: Pool, orderId: string) {
  const summaryRes = await pool.query(
    `
      SELECT id, totals
      FROM order_summary
      WHERE order_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [orderId]
  )

  if (!summaryRes.rows.length) {
    return
  }

  const currentTotals = summaryRes.rows[0].totals || {}
  const txSumRes = await pool.query(
    `
      SELECT COALESCE(SUM(amount), 0) AS transaction_total
      FROM order_transaction
      WHERE order_id = $1 AND deleted_at IS NULL
    `,
    [orderId]
  )

  const transactionTotal = Number(txSumRes.rows[0]?.transaction_total || 0)
  const orderTotal = Number(
    currentTotals.current_order_total || currentTotals.original_order_total || 0
  )
  const pendingDifference = Math.max(0, orderTotal - transactionTotal)

  const updatedTotals = {
    ...currentTotals,
    paid_total: transactionTotal,
    raw_paid_total: { value: String(transactionTotal), precision: 20 },
    transaction_total: transactionTotal,
    raw_transaction_total: { value: String(transactionTotal), precision: 20 },
    pending_difference: pendingDifference,
    raw_pending_difference: { value: String(pendingDifference), precision: 20 },
  }

  await pool.query(
    `
      UPDATE order_summary
      SET totals = $1, updated_at = now()
      WHERE order_id = $2
    `,
    [JSON.stringify(updatedTotals), orderId]
  )

  return transactionTotal
}

export async function markCodOrderAsPaid(orderId: string): Promise<MarkCodPaidResult> {
  const pool = getPool()

  try {
    const orderRes = await pool.query(
      `
        SELECT id, metadata, currency_code
        FROM "order"
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [orderId]
    )

    if (!orderRes.rows.length) {
      return { ok: false, status: 404, message: "Order not found" }
    }

    const order = orderRes.rows[0]
    const metadata = (order.metadata || {}) as Record<string, unknown>
    const paymentMethod =
      typeof metadata.payment_method === "string" ? metadata.payment_method.toLowerCase() : ""
    const codStatus =
      typeof metadata.cod_status === "string" ? metadata.cod_status.toLowerCase() : ""
    const isCod = paymentMethod === "cod" || codStatus === "confirmed"

    if (!isCod) {
      return { ok: false, status: 400, message: "This order is not a Cash on Delivery order." }
    }

    if (metadata.cod_payment_status === "captured") {
      return { ok: false, status: 400, message: "This COD order is already marked as paid." }
    }

    const summaryRes = await pool.query(
      `
        SELECT totals
        FROM order_summary
        WHERE order_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [orderId]
    )
    const totals = (summaryRes.rows[0]?.totals || {}) as Record<string, unknown>
    const orderTotal = Number(totals.current_order_total ?? totals.original_order_total ?? 0)
    const paidTotal = Number(totals.paid_total ?? 0)

    if (orderTotal > 0 && paidTotal >= orderTotal) {
      return { ok: false, status: 400, message: "This order is already fully paid." }
    }

    const isDelivered = await orderHasDeliveredFulfillment(pool, orderId)
    if (!isDelivered) {
      return {
        ok: false,
        status: 400,
        message: "Mark as paid is available only after the order is delivered.",
      }
    }

    const outstanding = orderTotal > 0 ? Math.max(orderTotal - paidTotal, 0) : 0
    const amountRupees = outstanding > 0 ? outstanding : orderTotal
    if (amountRupees <= 0) {
      return { ok: false, status: 400, message: "Unable to determine the order total for payment." }
    }

    const currencyCode = (order.currency_code as string | undefined)?.toLowerCase() || "inr"
    const referenceId = `cod_${crypto.randomUUID()}`

    await createCodPaymentRecord(pool, {
      order_id: orderId,
      amountRupees,
      currency_code: currencyCode,
    })

    await createCodOrderTransaction(pool, {
      order_id: orderId,
      amountRupees,
      currency_code: currencyCode,
      reference_id: referenceId,
    })

    const syncedPaidTotal = (await syncOrderSummaryPaidTotal(pool, orderId)) ?? amountRupees

    const nextMetadata = {
      ...metadata,
      payment_method: "cod",
      cod_status: "confirmed",
      cod_payment_status: "captured",
      cod_paid_at: new Date().toISOString(),
      razorpay_payment_status: "captured",
    }

    await pool.query(
      `
        UPDATE "order"
        SET metadata = $1::jsonb, updated_at = now()
        WHERE id = $2
      `,
      [JSON.stringify(nextMetadata), orderId]
    )

    return { ok: true, paidTotal: syncedPaidTotal, orderId }
  } finally {
    await pool.end()
  }
}
