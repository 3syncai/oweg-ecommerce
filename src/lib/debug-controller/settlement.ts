import type { Pool } from "pg";

type Commission = {
  id: string;
  status: string;
  commission_source: string;
  affiliate_user_id: string | null;
  affiliate_code: string | null;
  affiliate_commission: string;
};

/** Debug action only. Ledger transitions and wallet credits commit together. */
export async function forceSettleDebugOrder(pool: Pool, orderId: string) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ["commission:" + orderId]);
    const order = await db.query(`SELECT id FROM "order" WHERE id = $1 AND status <> 'canceled' AND deleted_at IS NULL FOR UPDATE`, [orderId]);
    if (!order.rowCount) throw new Error("Active order not found");
    const returns = await db.query(`SELECT id FROM return_request WHERE order_id = $1 AND deleted_at IS NULL
      AND LOWER(COALESCE(status, '')) NOT IN ('rejected', 'cancelled', 'canceled') LIMIT 1`, [orderId]);
    if (returns.rowCount) throw new Error("Cannot release earnings while the order has an active return request");

    const vendors = await db.query<{ vendor_id: string }>(`
      UPDATE vendor_earnings_log SET status = 'CREDITED',
        credited_at = COALESCE(credited_at, NOW()), unlock_at = NULL, updated_at = NOW()
      WHERE order_id = $1 AND status = 'UNLOCKING' RETURNING vendor_id
    `, [orderId]);
    // Complete only the commission's test hold; the real order/fulfillment
    // delivery dates and the configured category policy remain unchanged.
    const commissions = await db.query<Commission>(`
      UPDATE affiliate_commission_log
      SET policy_hold_days = COALESCE(policy_hold_days, resolve_commission_hold_days(order_id)),
          policy_delivered_at = NOW() - COALESCE(policy_hold_days, resolve_commission_hold_days(order_id)) * INTERVAL '1 day',
          unlock_at = NOW(), status = 'CREDITED', credited_at = NOW()
      WHERE order_id = $1 AND status = 'PENDING'
      RETURNING id, status, commission_source, affiliate_user_id, affiliate_code, affiliate_commission
    `, [orderId]);
    const wallets = new Set<string>();
    for (const row of commissions.rows) {
      if (row.status !== "CREDITED") throw new Error("Commission release was blocked by the database policy trigger");
      const amount = Number(row.affiliate_commission);
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Invalid commission amount");
      if (amount === 0) continue;
      let userId: string | null = null;
      if (row.commission_source === "affiliate") {
        const user = await db.query<{ id: string }>("SELECT id::text FROM affiliate_user WHERE refer_code = $1", [row.affiliate_code]);
        userId = user.rows[0]?.id || null;
      } else if (["branch_admin", "area_manager", "asm_direct", "state_admin", "state_admin_direct"].includes(row.commission_source)) {
        userId = row.affiliate_user_id;
      }
      if (!userId) throw new Error(`Commission ${row.id} has no supported wallet recipient`);
      await db.query(`INSERT INTO customer_wallet(customer_id, coins_balance) VALUES ($1::text, $2)
        ON CONFLICT (customer_id) DO UPDATE SET coins_balance = customer_wallet.coins_balance + EXCLUDED.coins_balance`,
        [userId, row.affiliate_commission]);
      wallets.add(userId);
    }
    await db.query("COMMIT");
    return {
      orderId, promoted: vendors.rowCount || 0,
      vendorIds: [...new Set(vendors.rows.map(row => row.vendor_id))],
      commissionsPromoted: commissions.rowCount || 0, walletsCredited: wallets.size,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
