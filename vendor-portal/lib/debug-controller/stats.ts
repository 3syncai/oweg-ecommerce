import type { DebugControllerStats } from "./types";
import { getDebugControllerPool, isDatabaseConfigured } from "./db";

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
  if (!isDatabaseConfigured()) {
    return {
      products: 0,
      variants: 0,
      orders: 0,
      customers: 0,
      vendors: 0,
    };
  }

  const [products, variants, orders, customers, vendors] = await Promise.all([
    countTable("product"),
    countTable("product_variant"),
    countTable("order"),
    countTable("customer"),
    countTable("vendor", "1=1"),
  ]);

  return {
    products,
    variants,
    orders,
    customers,
    vendors,
  };
}
