import type { DebugControllerStats } from "./types";
import { getDebugControllerPool } from "./db";

async function countTable(table: string, where = "deleted_at IS NULL"): Promise<number> {
  const db = getDebugControllerPool();
  try {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "${table}" WHERE ${where}`
    );
    return Number(result.rows[0]?.count || 0);
  } catch {
    return 0;
  }
}

export async function getDebugControllerStats(): Promise<DebugControllerStats> {
  const db = getDebugControllerPool();

  const [
    products,
    variants,
    orders,
    customers,
    carts,
    returnRequests,
    vendors,
  ] = await Promise.all([
    countTable("product"),
    countTable("product_variant"),
    countTable("order"),
    countTable("customer"),
    countTable("cart"),
    countTable("return_request", "1=1"),
    countTable("vendor", "1=1"),
  ]);

  let abandonedCarts = 0;
  try {
    const abandoned = await db.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM cart
      WHERE deleted_at IS NULL
        AND completed_at IS NULL
        AND updated_at < now() - interval '7 days'
    `);
    abandonedCarts = Number(abandoned.rows[0]?.count || 0);
  } catch {
    abandonedCarts = 0;
  }

  return {
    products,
    variants,
    orders,
    customers,
    carts,
    abandonedCarts,
    returnRequests,
    vendors,
  };
}
