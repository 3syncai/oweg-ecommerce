// src/scripts/debug-order-147.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const displayId = 147;
  console.log(`=== Debugging Order #${displayId} ===`);

  // 1. Order
  const orderRes = await pool.query(
    `SELECT id, display_id, status, is_draft_order, currency_code, created_at, metadata FROM "order" WHERE display_id = $1`,
    [displayId]
  );
  if ((orderRes.rowCount || 0) === 0) {
    console.error("Order not found");
    return;
  }
  const order = orderRes.rows[0];
  console.log("\n=== Order Details ===");
  console.table([order]);

  // 2. Order Summary totals JSON
  const summaryRes = await pool.query(
    `SELECT totals FROM order_summary WHERE order_id = $1`,
    [order.id]
  );
  if ((summaryRes.rowCount || 0) > 0) {
    console.log("\n=== Order Summary (totals JSON) ===");
    console.log(JSON.stringify(summaryRes.rows[0].totals, null, 2));
  }

  // 3. Order Transactions
  const otRes = await pool.query(
    `SELECT id, amount, currency_code, reference, reference_id, created_at FROM order_transaction WHERE order_id = $1 AND deleted_at IS NULL`,
    [order.id]
  );
  console.log("\n=== Order Transactions ===");
  console.table(otRes.rows);

  // 4. Payment Collections and Payments
  const pcRes = await pool.query(
    `SELECT pc.id, pc.status, pc.amount, pc.captured_amount, pc.refunded_amount, pc.created_at FROM payment_collection pc WHERE pc.id IN (SELECT payment_collection_id FROM order_payment_collection WHERE order_id = $1)`,
    [order.id]
  );
  console.log("\n=== Payment Collections ===");
  console.table(pcRes.rows);

  for (const pc of pcRes.rows) {
    const payRes = await pool.query(
      `SELECT id, amount, status, created_at FROM payment WHERE payment_collection_id = $1`,
      [pc.id]
    );
    console.log(`\n--- Payments for PC ${pc.id} ---`);
    console.table(payRes.rows);

    // Refunds for each payment
    const refundRes = await pool.query(
      `SELECT id, amount, created_at FROM refund WHERE payment_id = $1`,
      [payRes.rows[0]?.id]
    );
    if ((refundRes.rowCount || 0) > 0) {
      console.log("Refunds found:");
      console.table(refundRes.rows);
    } else {
      console.log("✅ No refunds");
    }
  }

  // 5. Secondary tables (order_change, return, claim, swap)
  const changeRes = await pool.query(
    `SELECT id, change_type, status, created_at FROM order_change WHERE order_id = $1`,
    [order.id]
  );
  console.log("\n=== Order Changes ===");
  console.table(changeRes.rows);

  const returnRes = await pool.query(
    `SELECT id, status, refund_amount FROM "return" WHERE order_id = $1`,
    [order.id]
  );
  console.log("\n=== Returns ===");
  console.table(returnRes.rows);

  const claimRes = await pool.query(
    `SELECT id, type, payment_status FROM claim_order WHERE order_id = $1`,
    [order.id]
  );
  console.log("\n=== Claims ===");
  console.table(claimRes.rows);

  const swapRes = await pool.query(
    `SELECT id, payment_status FROM swap WHERE order_id = $1`,
    [order.id]
  );
  console.log("\n=== Swaps ===");
  console.table(swapRes.rows);

  await pool.end();
}

main().catch((e) => console.error(e));
