import { getPool, ensureWalletLedgerIndexes, creditAdjustment } from "../src/lib/wallet-ledger";

async function main() {
  const pool = getPool();

  const dup = await pool.query(
    `SELECT order_id, COUNT(*)::int AS cnt
     FROM wallet_ledger
     WHERE type = 'EARN' AND order_id IS NOT NULL
     GROUP BY order_id
     HAVING COUNT(*) > 1`
  );
  console.log("orders with duplicate earns:", dup.rows.length);

  const del = await pool.query(
    `DELETE FROM wallet_ledger a
     USING wallet_ledger b
     WHERE a.type = 'EARN'
       AND a.order_id IS NOT NULL
       AND b.order_id = a.order_id
       AND b.type = 'EARN'
       AND a.id > b.id`
  );
  console.log("deleted duplicate earn rows:", del.rowCount);

  await ensureWalletLedgerIndexes();
  console.log("wallet ledger indexes ensured");

  const cust = await pool.query(
    `SELECT id, email FROM customer WHERE email = 'aman@gmail.com' LIMIT 1`
  );
  if (cust.rows[0]) {
    const cid = cust.rows[0].id as string;
    const orphan = await pool.query(
      `SELECT id, amount, reference_id FROM wallet_ledger
       WHERE customer_id = $1 AND type = 'SPEND' AND order_id IS NULL
       LIMIT 1`,
      [cid]
    );
    if (orphan.rows[0]) {
      const amt = Math.abs(Number(orphan.rows[0].amount));
      const ref = orphan.rows[0].reference_id as string;
      const r = await creditAdjustment({
        customerId: cid,
        referenceId: `refund-orphan:${ref}`,
        idempotencyKey: `refund-orphan:${ref}`,
        amountMinor: amt,
        reason: "orphan_coin_discount_refund",
        metadata: { ledger_id: orphan.rows[0].id },
      });
      console.log("orphan discount refund", amt, r);
    }

    const order610 = "order_01KV92TPMD94QTD6VGDAHYBEBB";
    const spend610 = await pool.query(
      `SELECT amount FROM wallet_ledger
       WHERE customer_id = $1 AND order_id = $2 AND type = 'SPEND' LIMIT 1`,
      [cid, order610]
    );
    const spent610 = Math.abs(Number(spend610.rows[0]?.amount || 0));
    const earns = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::bigint AS s FROM wallet_ledger
       WHERE customer_id = $1 AND type = 'EARN'`,
      [cid]
    );
    const otherSpends = await pool.query(
      `SELECT COALESCE(SUM(ABS(amount)), 0)::bigint AS s FROM wallet_ledger
       WHERE customer_id = $1 AND type = 'SPEND' AND order_id IS DISTINCT FROM $2`,
      [cid, order610]
    );
    const earned = Number(earns.rows[0].s);
    const otherSpent = Number(otherSpends.rows[0].s);
    const fairSpend610 = Math.max(0, Math.min(spent610, earned - otherSpent));
    const overdraw610 = spent610 - fairSpend610;
    if (overdraw610 > 0) {
      const r = await creditAdjustment({
        customerId: cid,
        referenceId: `refund-overdraw:${order610}`,
        idempotencyKey: `refund-overdraw:${order610}`,
        amountMinor: overdraw610,
        reason: "coin_overdraw_refund",
        metadata: { order_id: order610, spent: spent610, fair: fairSpend610 },
      });
      console.log("order 610 overdraw refund", overdraw610, r);
    }
  }

  const reconcile = await pool.query(
    `UPDATE wallet_account wa
     SET actual_balance = sub.ledger_sum, updated_at = NOW()
     FROM (
       SELECT customer_id, COALESCE(SUM(amount), 0)::bigint AS ledger_sum
       FROM wallet_ledger
       GROUP BY customer_id
     ) sub
     WHERE wa.customer_id = sub.customer_id`
  );
  console.log("reconciled accounts:", reconcile.rowCount);

  if (cust.rows[0]) {
    const cid = cust.rows[0].id as string;
    const bal = await pool.query(
      `SELECT actual_balance FROM wallet_account WHERE customer_id = $1`,
      [cid]
    );
    console.log(
      "aman balance:",
      Number(bal.rows[0]?.actual_balance) / 100,
      "coins"
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
