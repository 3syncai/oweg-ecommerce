import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { guardDebugRoute } from "@/lib/debug-route-guard";

export const dynamic = "force-dynamic";

/**
 * Order payment diagnostic.
 * GET /api/debug-order-payment?orderNo=717
 * GET /api/debug-order-payment?orderId=order_01...
 */
export async function GET(req: NextRequest) {
  const blocked = guardDebugRoute(req);
  if (blocked) return blocked;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const orderNo = searchParams.get("orderNo");
  const orderIdParam = searchParams.get("orderId");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    if (!orderNo && !orderIdParam) {
      const tables = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND (table_name LIKE '%order%payment%' OR table_name LIKE '%payment%order%')
      `);
      const latestPc = await pool.query(`
        SELECT id, amount, captured_amount, status FROM payment_collection 
        ORDER BY created_at DESC LIMIT 5
      `);
      await pool.end();
      return NextResponse.json({
        hint: "Pass ?orderNo=717 or ?orderId=order_...",
        link_tables: tables.rows.map((r) => r.table_name),
        latest_payment_collections: latestPc.rows,
      });
    }

    let orderId = orderIdParam || "";
    let displayId: number | string | null = orderNo;

    if (!orderId && orderNo) {
      const found = await pool.query(
        `SELECT id, display_id, status, metadata, created_at
         FROM "order" WHERE display_id = $1 LIMIT 1`,
        [Number(orderNo) || orderNo]
      );
      if (!found.rows[0]) {
        await pool.end();
        return NextResponse.json({ error: "order_not_found", orderNo }, { status: 404 });
      }
      orderId = found.rows[0].id;
      displayId = found.rows[0].display_id;
    }

    const orderRes = await pool.query(
      `SELECT id, display_id, status, metadata, created_at
       FROM "order" WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    const order = orderRes.rows[0];
    if (!order) {
      await pool.end();
      return NextResponse.json({ error: "order_not_found", orderId }, { status: 404 });
    }

    const summaryRes = await pool.query(
      `SELECT id, totals FROM order_summary WHERE order_id = $1 LIMIT 1`,
      [orderId]
    );
    const totals = summaryRes.rows[0]?.totals || {};

    const txRes = await pool.query(
      `SELECT id, amount, currency_code, reference, reference_id, created_at
       FROM order_transaction
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    const txSum = txRes.rows.reduce(
      (acc: number, row: { amount: string | number }) => acc + Number(row.amount || 0),
      0
    );

    const opcRes = await pool.query(
      `SELECT payment_collection_id FROM order_payment_collection WHERE order_id = $1`,
      [orderId]
    );
    const pcIds = opcRes.rows.map(
      (r: { payment_collection_id: string }) => r.payment_collection_id
    );

    let paymentCollections: unknown[] = [];
    let payments: unknown[] = [];
    if (pcIds.length) {
      const pcRes = await pool.query(
        `SELECT id, amount, captured_amount, status, currency_code, created_at
         FROM payment_collection WHERE id = ANY($1::text[])`,
        [pcIds]
      );
      paymentCollections = pcRes.rows;
      const payRes = await pool.query(
        `SELECT id, amount, currency_code, provider_id, captured_at, payment_collection_id, created_at
         FROM payment WHERE payment_collection_id = ANY($1::text[])
         ORDER BY created_at ASC`,
        [pcIds]
      );
      payments = payRes.rows;
    }

    await pool.end();
    return NextResponse.json({
      order: {
        id: order.id,
        display_id: order.display_id ?? displayId,
        status: order.status,
        razorpay_payment_id: (order.metadata as Record<string, unknown>)?.razorpay_payment_id,
        razorpay_capture_status: (order.metadata as Record<string, unknown>)
          ?.razorpay_capture_status,
      },
      summary: {
        paid_total: totals.paid_total,
        current_order_total: totals.current_order_total,
        original_order_total: totals.original_order_total,
        pending_difference: totals.pending_difference,
        transaction_total: totals.transaction_total,
      },
      transactions: {
        count: txRes.rows.length,
        sum: txSum,
        rows: txRes.rows,
      },
      payment_collections: paymentCollections,
      payments,
    });
  } catch (err) {
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    console.error("[debug-order-payment]", err);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
