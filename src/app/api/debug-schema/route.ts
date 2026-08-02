import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { guardDebugRoute } from "@/lib/debug-route-guard";

export async function GET(req: NextRequest) {
  const blocked = guardDebugRoute(req);
  if (blocked) return blocked;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const orderColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'order'
    `);

    const pcColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'payment_collection'
    `);

    const recentOrder = await pool.query(`
      SELECT * FROM "order" ORDER BY created_at DESC LIMIT 1
    `);

    await pool.end();

    return NextResponse.json({
      success: true,
      order_columns: orderColumns.rows.map((r) => r.column_name),
      payment_collection_columns: pcColumns.rows.map((r) => r.column_name),
      recent_order: recentOrder.rows[0],
    });
  } catch (err) {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    console.error("[debug-schema]", err);
    return NextResponse.json(
      {
        success: false,
        error: "Server Error",
      },
      { status: 500 }
    );
  }
}
