import { getPool, spendCoins, creditAdjustment } from "@/lib/wallet-ledger";

type SpendRow = {
  customer_id: string;
  amount: number;
};

export async function findSpendForOrder(orderId: string): Promise<SpendRow | null> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT customer_id, amount
     FROM wallet_ledger
     WHERE order_id = $1 AND type = 'SPEND'
     ORDER BY id DESC
     LIMIT 1`,
    [orderId]
  );
  return res.rows[0] || null;
}

export async function hasRefundForOrder(orderId: string, reason: string): Promise<boolean> {
  const pool = getPool();
  const key = `refund-${reason}:${orderId}`;
  const res = await pool.query(
    `SELECT id FROM wallet_ledger WHERE idempotency_key = $1 LIMIT 1`,
    [key]
  );
  return Boolean(res.rows[0]);
}

/**
 * Deduct wallet coins when payment is confirmed. Idempotent per order.
 */
export async function finalizeCoinSpendForOrder(options: {
  customerId: string;
  orderId: string;
  amountMinor: number;
}) {
  const amountMinor = Math.round(options.amountMinor);
  if (!options.customerId || !options.orderId || amountMinor <= 0) {
    return { applied: false, skipped: true, reason: "invalid_input" };
  }

  const existing = await findSpendForOrder(options.orderId);
  if (existing) {
    return { applied: false, alreadySpent: true };
  }

  const pool = getPool();
  const balRes = await pool.query(
    `SELECT actual_balance FROM wallet_account WHERE customer_id = $1`,
    [options.customerId]
  );
  const available = Math.max(0, Number(balRes.rows[0]?.actual_balance || 0));
  const spendMinor = Math.min(amountMinor, available);
  if (spendMinor <= 0) {
    return { applied: false, skipped: true, reason: "insufficient_balance" };
  }

  const result = await spendCoins({
    customerId: options.customerId,
    orderId: options.orderId,
    amountMinor: spendMinor,
    referenceId: `order:${options.orderId}`,
    idempotencyKey: `spend:order:${options.orderId}`,
    metadata: {
      reason: "order_payment_confirmed",
      requested_minor: amountMinor,
      capped: spendMinor < amountMinor,
    },
  });

  if (result.applied) {
    const pool2 = getPool();
    await pool2.query(
      `UPDATE "order"
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE id = $1`,
      [
        options.orderId,
        JSON.stringify({
          coin_discount_spent: true,
          coins_discounted: spendMinor / 100,
          coin_discount_capped: spendMinor < amountMinor,
          coin_discount_requested:
            spendMinor < amountMinor ? amountMinor / 100 : undefined,
        }),
      ]
    );
  }

  return result;
}

/**
 * Credit coins back when payment failed before spend, or on cancel/return after spend.
 * Only refunds if a SPEND ledger entry exists for the order (no free credits from metadata alone).
 */
export async function refundCoinSpendForOrder(options: {
  orderId: string;
  reason?: string;
}) {
  const reason = options.reason || "return";
  const idempotencyKey = `refund-${reason}:${options.orderId}`;

  if (await hasRefundForOrder(options.orderId, reason)) {
    return { success: true, alreadyRefunded: true, message: "Already refunded" };
  }

  const spend = await findSpendForOrder(options.orderId);
  if (!spend) {
    return { success: true, message: "No coin spend to refund" };
  }

  const amountMinor = Math.abs(Number(spend.amount) || 0);
  const customerId = spend.customer_id;
  if (amountMinor <= 0 || !customerId) {
    return { success: true, message: "No amount to refund" };
  }

  const credit = await creditAdjustment({
    customerId,
    referenceId: idempotencyKey,
    idempotencyKey,
    amountMinor,
    reason: `Refund coins for ${reason} ${options.orderId}`,
    metadata: { order_id: options.orderId, reason },
  });

  return {
    success: true,
    refunded_amount: amountMinor / 100,
    applied: credit.applied,
    actual_balance: credit.actual_balance,
  };
}
