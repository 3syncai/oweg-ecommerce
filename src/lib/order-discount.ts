import { getPool } from "@/lib/wallet-ledger";

type ApplyDiscountResult = {
  applied: boolean;
  totalMinor?: number;
  discountTotalMinor?: number;
};

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
    if (metadata.coin_discount_totals_applied === true) {
      await client.query("ROLLBACK");
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
    const currentOrderTotal = Number(totals.current_order_total || totals.original_order_total || 0);
    const currentDiscount = Number(totals.discount_total || 0);
    const paidTotal = Number(totals.paid_total || 0);

    const nextDiscountTotal = currentDiscount + discountMajor;
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
      coins_discountend: discountMajor,
      coin_discount_minor: discountMinor,
      coin_discount_rupees: discountMajor,
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

    await client.query("COMMIT");
    return { applied: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
