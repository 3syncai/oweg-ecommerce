import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const displayIdArg = process.argv[2];
  const displayId = Number(displayIdArg || "148");

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("🔎 Debugging order with display_id =", displayId);

  // 1) Find orders with this display_id
  const orderRes = await pool.query(
    `SELECT id, display_id, status, created_at FROM "order" WHERE display_id = $1 ORDER BY created_at DESC`,
    [displayId]
  );

  if (orderRes.rowCount === 0) {
    console.log("❌ No order found for this display_id");
    await pool.end();
    return;
  }

  console.log("\n🧾 Orders with this display_id:");
  console.table(orderRes.rows);

  console.log(`\nFound ${orderRes.rows.length} orders. Debugging ALL of them...`);

  for (const order of orderRes.rows) {
    const orderId = order.id;
    console.log(`\n\n==================================================`);
    console.log(`🔎 INSPECTING ORDER ID: ${orderId} (Created: ${order.created_at})`);
    console.log(`==================================================`);

  // 2) order_summary
  const summaryRes = await pool.query(
    `SELECT id, totals FROM order_summary WHERE order_id = $1`,
    [orderId]
  );
  console.log("\n📊 order_summary.totals:");
  console.dir(summaryRes.rows[0]?.totals || null, { depth: 5 });

  // 3) order_transaction
  const otRes = await pool.query(
    `SELECT id, amount, currency_code, reference, reference_id, created_at, deleted_at FROM order_transaction WHERE order_id = $1 ORDER BY created_at`,
    [orderId]
  );
  console.log("\n💳 order_transaction rows:");
  console.table(otRes.rows);

  // 4) payment_collection + payment
  const pcRes = await pool.query(
    `SELECT pc.id, pc.status, pc.amount, pc.captured_amount, pc.refunded_amount, pc.raw_amount, pc.raw_captured_amount, pc.raw_refunded_amount
       FROM payment_collection pc
       JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
       WHERE opc.order_id = $1`,
    [orderId]
  );
  console.log("\n🏦 payment_collection rows:");
  console.table(pcRes.rows);

  const payRes = await pool.query(
    `SELECT id, amount, currency_code, captured_at, canceled_at, data
       FROM payment
       WHERE payment_collection_id = ANY (
         SELECT pc.id FROM payment_collection pc
         JOIN order_payment_collection opc ON opc.payment_collection_id = pc.id
         WHERE opc.order_id = $1
       )`,
    [orderId]
  );
  console.log("\n🏦 payment rows:");
  console.table(payRes.rows);

  } // End of order loop

  await pool.end();
}

main().catch((err) => {
  console.error("❌ debug-refund-display failed:", err);
  process.exit(1);
});
