import crypto from "crypto";
import { getPool } from "@/lib/wallet-ledger";

type ApplyDiscountResult = {
  applied: boolean;
  totalMinor?: number;
  discountTotalMinor?: number;
};

const COIN_ADJUSTMENT_CODE = "OWEG_COINS";

/** Medusa admin subtracts positive adjustment amounts from the item subtotal. */
async function insertCoinAdjustmentLine(
  client: import("pg").PoolClient,
  orderId: string,
  discountMajor: number
) {
  const lineRes = await client.query(
    `SELECT oli.id AS line_item_id
     FROM order_item oi
     JOIN order_line_item oli ON oi.item_id = oli.id
     WHERE oi.order_id = $1
     ORDER BY oi.created_at ASC
     LIMIT 1`,
    [orderId]
  );
  const lineItemId = lineRes.rows[0]?.line_item_id as string | undefined;
  if (!lineItemId) return;

  await client.query(
    `UPDATE order_line_item_adjustment a
     SET deleted_at = now(), updated_at = now()
     FROM order_line_item oli, order_item oi
     WHERE oi.order_id = $1
       AND oi.item_id = oli.id
       AND a.item_id = oli.id
       AND a.code = $2
       AND a.deleted_at IS NULL
       AND (a.amount::numeric <= 0 OR a.amount::numeric != $3::numeric)`,
    [orderId, COIN_ADJUSTMENT_CODE, discountMajor]
  );

  const existing = await client.query(
    `SELECT a.id FROM order_line_item_adjustment a
     WHERE a.item_id = $1 AND a.code = $2 AND a.deleted_at IS NULL
       AND a.amount::numeric = $3::numeric
     LIMIT 1`,
    [lineItemId, COIN_ADJUSTMENT_CODE, discountMajor]
  );
  if (existing.rows[0]) return;

  const rawAmount = JSON.stringify({ value: String(discountMajor), precision: 20 });
  await client.query(
    `INSERT INTO order_line_item_adjustment (
       id, description, promotion_id, code, amount, raw_amount,
       provider_id, item_id, is_tax_inclusive, created_at, updated_at
     ) VALUES (
       $1, $2, NULL, $3, $4, $5::jsonb, $6, $7, false, now(), now()
     )`,
    [
      crypto.randomUUID(),
      `OWEG Coins (−₹${discountMajor})`,
      COIN_ADJUSTMENT_CODE,
      discountMajor,
      rawAmount,
      "oweg-wallet",
      lineItemId,
    ]
  );
}

export async function syncOrderShippingAmount(orderId: string, shippingRupees: number) {
  const pool = getPool();
  const amount = Math.max(0, Number(shippingRupees));
  const rawAmount = JSON.stringify({ value: String(amount), precision: 20 });

  await pool.query(
    `UPDATE order_shipping_method osm
     SET amount = $1::numeric,
         raw_amount = $2::jsonb,
         name = CASE WHEN $1::numeric = 0 THEN 'Free Shipping' ELSE osm.name END,
         updated_at = now()
     FROM order_shipping os
     WHERE os.order_id = $3 AND os.shipping_method_id = osm.id`,
    [amount, rawAmount, orderId]
  );
}

export async function applyCoinDiscountToOrder(options: {
  orderId: string;
  discountMinor: number;
}): Promise<ApplyDiscountResult> {
  const orderId = options.orderId?.trim();
  const discountMinor = Math.round(options.discountMinor || 0);
  const discountMajor = discountMinor / 100;

  if (!orderId || discountMinor <= 0) {
    return { applied: false };
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query(
      `SELECT metadata
       FROM "order"
       WHERE id = $1
       FOR UPDATE`,
      [orderId]
    );

    if (!orderRes.rows[0]) {
      await client.query("ROLLBACK");
      return { applied: false };
    }

    const row = orderRes.rows[0] as {
      metadata?: Record<string, unknown> | null;
    };

    const metadata = (row.metadata || {}) as Record<string, unknown>;
    const alreadyApplied = metadata.coin_discount_totals_applied === true;
    const existingDiscountMajor =
      typeof metadata.coin_discount_rupees === "number"
        ? metadata.coin_discount_rupees
        : typeof metadata.coins_discounted === "number"
          ? metadata.coins_discounted
          : discountMajor;

    if (alreadyApplied) {
      await insertCoinAdjustmentLine(client, orderId, existingDiscountMajor);
      await client.query("COMMIT");
      return { applied: false };
    }

    const summaryRes = await client.query(
      `SELECT totals
       FROM order_summary
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId]
    );

    const totals = (summaryRes.rows[0]?.totals || {}) as Record<string, unknown>;
    const originalOrderTotal = Number(totals.original_order_total || 0);
    const currentOrderTotal = Number(totals.current_order_total || originalOrderTotal || 0);
    const currentDiscount = Number(totals.discount_total || 0);
    const paidTotal = Number(totals.paid_total || 0);

    // Medusa admin treats discount_total as signed: negative = reduction (e.g. -75 for ₹75 off).
    const nextDiscountTotal = currentDiscount - discountMajor;
    const nextCurrentTotal = Math.max(0, currentOrderTotal - discountMajor);
    const nextPendingDifference = Math.max(0, nextCurrentTotal - paidTotal);

    const updatedTotals = {
      ...totals,
      discount_total: nextDiscountTotal,
      raw_discount_total: { value: String(nextDiscountTotal), precision: 20 },
      current_order_total: nextCurrentTotal,
      raw_current_order_total: { value: String(nextCurrentTotal), precision: 20 },
      accounting_total: nextCurrentTotal,
      raw_accounting_total: { value: String(nextCurrentTotal), precision: 20 },
      pending_difference: nextPendingDifference,
      raw_pending_difference: { value: String(nextPendingDifference), precision: 20 },
    };

    const nextMetadata = {
      ...metadata,
      coin_discount_totals_applied: true,
      coins_discounted: discountMajor,
      coin_discount_minor: discountMinor,
      coin_discount_rupees: discountMajor,
      coin_discount_applied: `₹${discountMajor.toFixed(2)} OWEG Coins`,
    };

    await client.query(
      `UPDATE "order"
       SET metadata = $2::jsonb,
           updated_at = now()
       WHERE id = $1`,
      [orderId, JSON.stringify(nextMetadata)]
    );

    await client.query(
      `UPDATE order_summary
       SET totals = $2, updated_at = now()
       WHERE order_id = $1`,
      [orderId, JSON.stringify(updatedTotals)]
    );

    await insertCoinAdjustmentLine(client, orderId, discountMajor);

    await client.query("COMMIT");
    return {
      applied: true,
      totalMinor: Math.round(nextCurrentTotal * 100),
      discountTotalMinor: Math.round(nextDiscountTotal * 100),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
