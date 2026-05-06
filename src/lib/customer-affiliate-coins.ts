import type { PoolClient } from "pg"
import { creditAdjustment, getPool } from "@/lib/wallet-ledger"

/**
 * Customer-Affiliate ("?ref=" / customer_referrer) coin lifecycle helpers.
 *
 * Lifecycle:
 *   - Order paid          → logPendingCoinsForOrder()  → coins go to PENDING
 *   - Order delivered     → creditPendingCoinsForOrder() → PENDING -> EARNED, wallet credited
 *   - Order cancelled     → cancelOrReverseCoinsForOrder() → mark CANCELLED, refund wallet if already EARNED
 *   - Return approved     → cancelOrReverseCoinsForOrder() → REVERSED, wallet debited
 *
 * All operations are idempotent — calling them multiple times for the same
 * order is safe.
 *
 * Independent from `affiliate_commission_log` (the agent-side commission
 * system) — that flow is left untouched.
 */

const COMMISSION_RATE = 0.10 // 10% of product price

type LineItem = {
    line_item_id: string
    product_id: string | null
    product_name: string | null
    quantity: number
    unit_price_rupees: number
}

async function fetchOrderLineItems(orderId: string): Promise<{
    customerId: string | null
    items: LineItem[]
}> {
    const pool = getPool()
    const res = await pool.query(
        `SELECT
            o.customer_id      AS customer_id,
            oli.id             AS line_item_id,
            oli.product_id     AS product_id,
            COALESCE(oli.product_title, oli.title) AS product_name,
            oi.quantity        AS quantity,
            oli.unit_price     AS unit_price
         FROM "order" o
         JOIN order_item oi      ON oi.order_id = o.id
         JOIN order_line_item oli ON oli.id    = oi.item_id
         WHERE o.id = $1`,
        [orderId]
    )

    if (res.rows.length === 0) {
        return { customerId: null, items: [] }
    }

    const customerId = res.rows[0].customer_id as string | null
    const items: LineItem[] = res.rows.map((r: {
        line_item_id: string
        product_id: string | null
        product_name: string | null
        quantity: number | string
        unit_price: number | string
    }) => ({
        line_item_id: r.line_item_id,
        product_id: r.product_id,
        product_name: r.product_name,
        quantity: parseInt(String(r.quantity), 10) || 0,
        unit_price_rupees: parseFloat(String(r.unit_price)) || 0,
    }))

    return { customerId, items }
}

async function lookupCustomerReferrerForCustomer(customerId: string): Promise<{
    refer_code: string
    affiliate_customer_id: string
} | null> {
    const pool = getPool()
    const res = await pool.query(
        `SELECT refer_code, affiliate_customer_id
         FROM customer_referrer_referrals
         WHERE referred_customer_id = $1
         ORDER BY referred_at DESC
         LIMIT 1`,
        [customerId]
    )
    if (res.rows.length === 0) return null
    return {
        refer_code: res.rows[0].refer_code,
        affiliate_customer_id: res.rows[0].affiliate_customer_id,
    }
}

/**
 * Returns the set of product_ids the given customer has already redeemed
 * with the given refer_code (entries that are still PENDING or EARNED).
 * CANCELLED / REVERSED entries are NOT considered "used" — the customer
 * can re-apply the code on those products on a new order.
 */
export async function getUsedProductIdsForCustomer(
    customerId: string,
    referCode: string
): Promise<Set<string>> {
    if (!customerId || !referCode) return new Set()
    const pool = getPool()
    const res = await pool.query(
        `SELECT DISTINCT product_id
           FROM customer_referrer_coins_log
          WHERE referred_customer_id = $1
            AND UPPER(refer_code) = UPPER($2)
            AND product_id IS NOT NULL
            AND status IN ('PENDING', 'EARNED')`,
        [customerId, referCode]
    )
    return new Set(res.rows.map((r: { product_id: string }) => r.product_id))
}

/**
 * Step 1 — On order paid (COD confirmed / Razorpay confirmed):
 * Logs PENDING coin entries for each line item if the order's customer used
 * a customer-affiliate code. Idempotent: skipped if any rows already exist
 * for this order in customer_referrer_coins_log.
 *
 * One-time-per-product enforcement: line items whose product_id has already
 * been redeemed (PENDING or EARNED) by this customer with this refer_code
 * are silently skipped — no coins logged.
 */
export async function logPendingCoinsForOrder(orderId: string): Promise<{
    skipped: boolean
    reason?: string
    refer_code?: string
    pending_total?: number
    entries_created?: number
    skipped_products?: string[]
}> {
    if (!orderId) return { skipped: true, reason: "missing orderId" }
    const pool = getPool()

    const existing = await pool.query(
        `SELECT 1 FROM customer_referrer_coins_log WHERE order_id = $1 LIMIT 1`,
        [orderId]
    )
    if (existing.rows.length > 0) {
        return { skipped: true, reason: "already logged" }
    }

    const { customerId, items } = await fetchOrderLineItems(orderId)
    if (!customerId) return { skipped: true, reason: "order has no customer_id" }
    if (items.length === 0) return { skipped: true, reason: "no line items" }

    const ref = await lookupCustomerReferrerForCustomer(customerId)
    if (!ref) return { skipped: true, reason: "customer has no affiliate code" }

    if (ref.affiliate_customer_id === customerId) {
        return { skipped: true, reason: "self-referral" }
    }

    const alreadyUsed = await getUsedProductIdsForCustomer(customerId, ref.refer_code)

    let pendingTotal = 0
    let created = 0
    let creditedOrderValue = 0
    const skippedProducts: string[] = []

    const client = await pool.connect()
    try {
        await client.query("BEGIN")
        for (const item of items) {
            if (item.product_id && alreadyUsed.has(item.product_id)) {
                skippedProducts.push(item.product_id)
                continue
            }
            const lineTotal = item.unit_price_rupees * item.quantity
            const coins = +(lineTotal * COMMISSION_RATE).toFixed(2)
            if (coins <= 0) continue
            const reason = `10% on ${item.product_name || "product"} (qty ${item.quantity})`
            await client.query(
                `INSERT INTO customer_referrer_coins_log
                   (affiliate_customer_id, refer_code, referred_customer_id,
                    order_id, product_id, coins, status, reason)
                 VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7)`,
                [
                    ref.affiliate_customer_id,
                    ref.refer_code,
                    customerId,
                    orderId,
                    item.product_id,
                    coins,
                    reason,
                ]
            )
            pendingTotal += coins
            created += 1
            creditedOrderValue += lineTotal
        }

        if (pendingTotal > 0) {
            await client.query(
                `UPDATE customer_referrer
                 SET pending_coins = COALESCE(pending_coins, 0) + $1,
                     updated_at = NOW()
                 WHERE customer_id = $2`,
                [pendingTotal, ref.affiliate_customer_id]
            )

            await client.query(
                `UPDATE customer_referrer_referrals
                 SET total_orders     = COALESCE(total_orders, 0) + 1,
                     total_order_value = COALESCE(total_order_value, 0) + $1,
                     first_order_at   = COALESCE(first_order_at, NOW())
                 WHERE refer_code = $2 AND referred_customer_id = $3`,
                [
                    creditedOrderValue,
                    ref.refer_code,
                    customerId,
                ]
            )
        }

        await client.query("COMMIT")
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { })
        throw err
    } finally {
        client.release()
    }

    return {
        skipped: false,
        refer_code: ref.refer_code,
        pending_total: pendingTotal,
        entries_created: created,
        skipped_products: skippedProducts,
    }
}

/**
 * Step 2 — On order delivered:
 * Moves PENDING coins for the order to EARNED, credits the affiliate's wallet,
 * and updates the customer_referrer balances.
 */
export async function creditPendingCoinsForOrder(orderId: string): Promise<{
    skipped: boolean
    reason?: string
    credited_total?: number
    entries_credited?: number
    affiliate_customer_id?: string
}> {
    if (!orderId) return { skipped: true, reason: "missing orderId" }
    const pool = getPool()

    const rows = await pool.query(
        `SELECT id, affiliate_customer_id, refer_code, coins
         FROM customer_referrer_coins_log
         WHERE order_id = $1 AND status = 'PENDING'`,
        [orderId]
    )
    if (rows.rows.length === 0) {
        return { skipped: true, reason: "no PENDING coins for order" }
    }

    let creditedTotal = 0
    let credited = 0
    let affiliateCustomerId: string | undefined

    for (const row of rows.rows) {
        const coins = parseFloat(row.coins) || 0
        if (coins <= 0) continue
        affiliateCustomerId = row.affiliate_customer_id

        try {
            const amountMinor = Math.round(coins * 100)
            await creditAdjustment({
                customerId: row.affiliate_customer_id,
                referenceId: `customer-referrer:${row.id}`,
                idempotencyKey: `customer-referrer:${row.id}`,
                amountMinor,
                reason: `Affiliate coins for order ${orderId}`,
                metadata: {
                    source: "customer_referrer",
                    refer_code: row.refer_code,
                    order_id: orderId,
                    log_id: row.id,
                },
            })

            const upd = await pool.query(
                `UPDATE customer_referrer_coins_log
                 SET status = 'EARNED', unlocked_at = NOW()
                 WHERE id = $1 AND status = 'PENDING'`,
                [row.id]
            )

            if ((upd.rowCount || 0) > 0) {
                creditedTotal += coins
                credited += 1
            }
        } catch (err) {
            console.error(
                `[customer-affiliate-coins] credit failed for log ${row.id}:`,
                err
            )
        }
    }

    if (creditedTotal > 0 && affiliateCustomerId) {
        await pool.query(
            `UPDATE customer_referrer
             SET earned_coins  = COALESCE(earned_coins, 0)  + $1,
                 pending_coins = GREATEST(COALESCE(pending_coins, 0) - $1, 0),
                 updated_at    = NOW()
             WHERE customer_id = $2`,
            [creditedTotal, affiliateCustomerId]
        )

        await pool.query(
            `UPDATE customer_referrer_referrals
             SET coins_earned = COALESCE(coins_earned, 0) + $1
             WHERE refer_code = (SELECT refer_code FROM customer_referrer WHERE customer_id = $2)
               AND referred_customer_id = (
                   SELECT referred_customer_id FROM customer_referrer_coins_log
                   WHERE order_id = $3 LIMIT 1
               )`,
            [creditedTotal, affiliateCustomerId, orderId]
        )
    }

    return {
        skipped: false,
        credited_total: creditedTotal,
        entries_credited: credited,
        affiliate_customer_id: affiliateCustomerId,
    }
}

async function debitWalletForReversal(
    client: PoolClient,
    customerId: string,
    amountMinor: number,
    idempotencyKey: string,
    metadata: Record<string, unknown>
): Promise<boolean> {
    if (amountMinor <= 0) return false

    await client.query(
        `INSERT INTO wallet_account (customer_id, actual_balance)
         VALUES ($1, 0)
         ON CONFLICT (customer_id) DO NOTHING`,
        [customerId]
    )

    const dup = await client.query(
        `SELECT 1 FROM wallet_ledger WHERE idempotency_key = $1 LIMIT 1`,
        [idempotencyKey]
    )
    if (dup.rows.length > 0) return false

    await client.query(
        `INSERT INTO wallet_ledger
            (customer_id, order_id, type, amount, idempotency_key, metadata)
         VALUES ($1, $2, 'REVERSE', $3, $4, $5)`,
        [
            customerId,
            metadata.order_id || null,
            -amountMinor,
            idempotencyKey,
            JSON.stringify(metadata || {}),
        ]
    )

    await client.query(
        `UPDATE wallet_account
         SET actual_balance = actual_balance - $1, updated_at = NOW()
         WHERE customer_id = $2`,
        [amountMinor, customerId]
    )
    return true
}

/**
 * Step 3 — On order cancelled / return approved:
 *   - PENDING entries → marked CANCELLED, pending_coins decremented (no wallet impact)
 *   - EARNED entries  → marked REVERSED, wallet debited, earned_coins decremented
 *
 * Idempotent.
 */
export async function cancelOrReverseCoinsForOrder(
    orderId: string,
    options: { event?: string } = {}
): Promise<{
    skipped: boolean
    reason?: string
    cancelled_pending?: number
    reversed_earned?: number
    affiliate_customer_id?: string
}> {
    if (!orderId) return { skipped: true, reason: "missing orderId" }
    const pool = getPool()

    const rows = await pool.query(
        `SELECT id, affiliate_customer_id, refer_code, coins, status
         FROM customer_referrer_coins_log
         WHERE order_id = $1 AND status IN ('PENDING', 'EARNED')`,
        [orderId]
    )
    if (rows.rows.length === 0) {
        return { skipped: true, reason: "no active coin entries for order" }
    }

    const isReturn =
        (options.event || "").includes("return") ||
        (options.event || "").includes("refund")

    let cancelledTotal = 0
    let reversedTotal = 0
    let affiliateCustomerId: string | undefined

    const client = await pool.connect()
    try {
        await client.query("BEGIN")
        for (const row of rows.rows) {
            const coins = parseFloat(row.coins) || 0
            if (coins <= 0) continue
            affiliateCustomerId = row.affiliate_customer_id

            if (row.status === "PENDING") {
                const upd = await client.query(
                    `UPDATE customer_referrer_coins_log
                     SET status = 'CANCELLED', reason = COALESCE(reason, '') ||
                                ' [cancelled: ' || $2 || ']'
                     WHERE id = $1 AND status = 'PENDING'`,
                    [row.id, options.event || "order.cancelled"]
                )
                if ((upd.rowCount || 0) > 0) cancelledTotal += coins
            } else if (row.status === "EARNED") {
                const amountMinor = Math.round(coins * 100)
                const idempotencyKey = `customer-referrer-reverse:${row.id}`
                const debited = await debitWalletForReversal(
                    client,
                    row.affiliate_customer_id,
                    amountMinor,
                    idempotencyKey,
                    {
                        source: "customer_referrer",
                        refer_code: row.refer_code,
                        order_id: orderId,
                        log_id: row.id,
                        reason: isReturn ? "return" : "cancellation",
                    }
                )
                const upd = await client.query(
                    `UPDATE customer_referrer_coins_log
                     SET status = 'REVERSED', reason = COALESCE(reason, '') ||
                                ' [reversed: ' || $2 || ']'
                     WHERE id = $1 AND status = 'EARNED'`,
                    [row.id, options.event || "order.returned"]
                )
                if ((upd.rowCount || 0) > 0 && debited) reversedTotal += coins
            }
        }

        if (cancelledTotal > 0 && affiliateCustomerId) {
            await client.query(
                `UPDATE customer_referrer
                 SET pending_coins = GREATEST(COALESCE(pending_coins, 0) - $1, 0),
                     updated_at = NOW()
                 WHERE customer_id = $2`,
                [cancelledTotal, affiliateCustomerId]
            )
        }
        if (reversedTotal > 0 && affiliateCustomerId) {
            await client.query(
                `UPDATE customer_referrer
                 SET earned_coins = GREATEST(COALESCE(earned_coins, 0) - $1, 0),
                     updated_at = NOW()
                 WHERE customer_id = $2`,
                [reversedTotal, affiliateCustomerId]
            )

            await client.query(
                `UPDATE customer_referrer_referrals
                 SET coins_earned = GREATEST(COALESCE(coins_earned, 0) - $1, 0)
                 WHERE refer_code = (SELECT refer_code FROM customer_referrer WHERE customer_id = $2)
                   AND referred_customer_id = (
                       SELECT referred_customer_id FROM customer_referrer_coins_log
                       WHERE order_id = $3 LIMIT 1
                   )`,
                [reversedTotal, affiliateCustomerId, orderId]
            )
        }
        await client.query("COMMIT")
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { })
        throw err
    } finally {
        client.release()
    }

    return {
        skipped: false,
        cancelled_pending: cancelledTotal,
        reversed_earned: reversedTotal,
        affiliate_customer_id: affiliateCustomerId,
    }
}
