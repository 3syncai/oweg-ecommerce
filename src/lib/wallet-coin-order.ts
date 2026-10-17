import { transaction, consumeCheckoutCoins } from "@/lib/payment-reliability";
import { getPool, refundOrderCoinSpend } from "@/lib/wallet-ledger";

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

/** Cancellation restores only the remaining debit after item-level return receipts. */
export async function refundCoinSpendForOrder(options:{orderId:string;reason?:string}) {
  if((options.reason||'').includes('return')) throw new Error('Return refunds require a return receipt and item allocation');
  return refundOrderCoinSpend({orderId:options.orderId,reason:options.reason||'cancelled'});
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
  if (!Number.isSafeInteger(options.amountMinor) || options.amountMinor <= 0) throw new Error("invalid_coin_amount");
  return transaction(getPool(), async client => {
    const order = (await client.query('SELECT customer_id,metadata FROM "order" WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[options.orderId])).rows[0];
    if (!order || order.customer_id !== options.customerId) throw new Error("coin_order_owner_mismatch");
    const metadata = order.metadata || {};
    if (Number(metadata.coin_discount_minor ?? Math.round(Number(metadata.coin_discount_rupees||0)*100)) !== options.amountMinor) throw new Error("coin_discount_mismatch");
    return consumeCheckoutCoins(client,{orderId:options.orderId,customerId:options.customerId,metadata});
  });
}
