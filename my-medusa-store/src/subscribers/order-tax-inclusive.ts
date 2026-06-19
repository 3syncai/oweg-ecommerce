import { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { Pool } from "pg";

async function syncOrderTaxInclusive(orderId: string) {
  if (!process.env.DATABASE_URL) return;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE order_line_item oli
       SET is_tax_inclusive = true, updated_at = now()
       FROM order_item oi
       WHERE oi.order_id = $1 AND oi.item_id = oli.id AND oi.deleted_at IS NULL`,
      [orderId]
    );

    await client.query(
      `UPDATE order_shipping_method osm
       SET is_tax_inclusive = true, updated_at = now()
       FROM order_shipping os
       WHERE os.order_id = $1 AND os.shipping_method_id = osm.id`,
      [orderId]
    );

    await client.query(
      `UPDATE order_line_item_tax_line t
       SET deleted_at = now(), updated_at = now()
       FROM order_item oi
       WHERE oi.order_id = $1 AND oi.item_id = t.item_id AND t.deleted_at IS NULL`,
      [orderId]
    );

    await client.query(
      `UPDATE order_shipping_method_tax_line t
       SET deleted_at = now(), updated_at = now()
       FROM order_shipping os
       WHERE os.order_id = $1 AND os.shipping_method_id = t.shipping_method_id AND t.deleted_at IS NULL`,
      [orderId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[TaxInclusive] Failed for order ${orderId}:`, err);
  } finally {
    client.release();
    await pool.end();
  }
}

export default async function orderTaxInclusiveSubscriber({
  event: { data },
}: SubscriberArgs<{ id: string }>) {
  await syncOrderTaxInclusive(data.id);
}

export const config: SubscriberConfig = {
  event: ["order.placed", "order.created"],
};
