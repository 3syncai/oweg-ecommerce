import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { guardDebugRoute } from "@/lib/debug-route-guard";

export async function GET(req: NextRequest) {
  const blocked = guardDebugRoute(req);
  if (blocked) return blocked;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const existing = await pool.query(`
      SELECT DISTINCT status FROM payment_collection LIMIT 20
    `);

    const constraint = await pool.query(`
      SELECT pg_get_constraintdef(oid) as def 
      FROM pg_constraint 
      WHERE conname = 'payment_collection_status_check'
    `);

    await pool.end();

    return NextResponse.json({
      existing_statuses: existing.rows.map((r) => r.status),
      constraint_definition: constraint.rows[0]?.def,
    });
  } catch (err) {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    console.error("[debug-status]", err);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
