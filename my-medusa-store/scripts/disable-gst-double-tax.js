/**
 * OWEG storefront prices are tax-inclusive. Medusa was adding 18% GST on top.
 * This script disables default GST rates and removes phantom tax lines from orders.
 *
 * Usage: node scripts/disable-gst-double-tax.js
 */
require("dotenv").config();
const { Pool } = require("pg");

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const disabledRates = await client.query(`
      UPDATE tax_rate
      SET deleted_at = now(), updated_at = now()
      WHERE deleted_at IS NULL
      RETURNING id, code, rate
    `);
    console.log(`Disabled ${disabledRates.rowCount} tax rate(s):`, disabledRates.rows);

    const itemTax = await client.query(`
      UPDATE order_line_item_tax_line
      SET deleted_at = now(), updated_at = now()
      WHERE deleted_at IS NULL
    `);
    console.log(`Removed ${itemTax.rowCount} order line item tax line(s)`);

    const shipTax = await client.query(`
      UPDATE order_shipping_method_tax_line
      SET deleted_at = now(), updated_at = now()
      WHERE deleted_at IS NULL
    `);
    console.log(`Removed ${shipTax.rowCount} shipping tax line(s)`);

    const inclusiveItems = await client.query(`
      UPDATE order_line_item oli
      SET is_tax_inclusive = true, updated_at = now()
      FROM order_item oi
      WHERE oi.item_id = oli.id
        AND oi.deleted_at IS NULL
        AND oli.deleted_at IS NULL
        AND oli.is_tax_inclusive IS DISTINCT FROM true
    `);
    console.log(`Marked ${inclusiveItems.rowCount} line item(s) tax-inclusive`);

    const inclusiveShipping = await client.query(`
      UPDATE order_shipping_method osm
      SET is_tax_inclusive = true, updated_at = now()
      FROM order_shipping os
      WHERE os.shipping_method_id = osm.id
        AND osm.deleted_at IS NULL
        AND osm.is_tax_inclusive IS DISTINCT FROM true
    `);
    console.log(`Marked ${inclusiveShipping.rowCount} shipping method(s) tax-inclusive`);

    const summaries = await client.query(`SELECT order_id, totals FROM order_summary`);
    let updatedSummaries = 0;

    for (const row of summaries.rows) {
      const totals = row.totals || {};
      const paidTotal = Number(totals.paid_total || 0);
      let grandTotal = Number(totals.current_order_total || totals.original_order_total || 0);

      if (!grandTotal || grandTotal <= 0) {
        const itemsRes = await client.query(
          `SELECT COALESCE(SUM(oli.unit_price::numeric * oi.quantity::numeric), 0) AS items_total
           FROM order_item oi
           JOIN order_line_item oli ON oi.item_id = oli.id
           WHERE oi.order_id = $1 AND oi.deleted_at IS NULL AND oli.deleted_at IS NULL`,
          [row.order_id]
        );
        const shipRes = await client.query(
          `SELECT COALESCE(SUM(osm.amount::numeric), 0) AS shipping_total
           FROM order_shipping os
           JOIN order_shipping_method osm ON os.shipping_method_id = osm.id
           WHERE os.order_id = $1`,
          [row.order_id]
        );
        grandTotal =
          Number(itemsRes.rows[0]?.items_total || 0) + Number(shipRes.rows[0]?.shipping_total || 0);
      }

      const pendingDifference = Math.max(0, grandTotal - paidTotal);
      const updatedTotals = {
        ...totals,
        tax_total: 0,
        raw_tax_total: { value: "0", precision: 20 },
        current_order_total: grandTotal,
        original_order_total: grandTotal,
        accounting_total: grandTotal,
        raw_current_order_total: { value: String(grandTotal), precision: 20 },
        raw_original_order_total: { value: String(grandTotal), precision: 20 },
        raw_accounting_total: { value: String(grandTotal), precision: 20 },
        pending_difference: pendingDifference,
        raw_pending_difference: { value: String(pendingDifference), precision: 20 },
      };

      await client.query(
        `UPDATE order_summary SET totals = $2::jsonb, updated_at = now() WHERE order_id = $1`,
        [row.order_id, JSON.stringify(updatedTotals)]
      );
      updatedSummaries += 1;
    }

    console.log(`Updated ${updatedSummaries} order summary record(s)`);
    await client.query("COMMIT");
    console.log("Done. GST double-tax cleanup complete.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
