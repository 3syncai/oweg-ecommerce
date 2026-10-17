import { NextRequest, NextResponse } from "next/server";
import {
  extractDebugAuthToken,
  verifyDebugControllerToken,
} from "@/lib/debug-controller/auth";
import { getDebugControllerPool } from "@/lib/debug-controller/db";
import type {
  DebugDeliverableOrder,
  DebugPendingSettlementOrder,
} from "@/lib/debug-controller/types";

export const dynamic = "force-dynamic";

function getDeliverableOrder(row: {
  id: string;
  display_id: string | number | null;
  email: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}): DebugDeliverableOrder | null {
  const metadata = row.metadata || {};
  const workflows = metadata.vendor_order_workflows as Record<string, Record<string, unknown>> | undefined;
  const debugDeliveredAt = typeof metadata.debug_marked_delivered_at === "string"
    ? metadata.debug_marked_delivered_at
    : null;
  if (debugDeliveredAt) {
    return {
      id: row.id,
      displayId: String(row.display_id || row.id),
      email: row.email,
      createdAt: row.created_at,
      stage: "delivered",
      vendors: Object.keys(workflows || {}),
    };
  }
  const vendorEntries = Object.entries(workflows || {}).filter(([, workflow]) => {
    const stage = String(workflow.stage || "").toLowerCase();
    const tracking = String(workflow.shiprocket_status || "").toLowerCase();
    return stage === "to_dispatch" || stage === "in_transit" || tracking.includes("transit") || tracking.includes("dispatch");
  });
  const rootStatus = String(metadata.shiprocket_status || "").toLowerCase();
  if (!vendorEntries.length && !rootStatus.includes("transit") && !rootStatus.includes("dispatch")) {
    return null;
  }

  return {
    id: row.id,
    displayId: String(row.display_id || row.id),
    email: row.email,
    createdAt: row.created_at,
    stage: vendorEntries.some(([, workflow]) => String(workflow.stage || "").toLowerCase() === "in_transit") || rootStatus.includes("transit")
      ? "in_transit"
      : "to_dispatch",
    vendors: vendorEntries.map(([vendorId]) => vendorId),
  };
}

export async function GET(req: NextRequest) {
  if (!verifyDebugControllerToken(extractDebugAuthToken(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDebugControllerPool();
  try {
    const result = await db.query<{
      id: string;
      display_id: string | number | null;
      email: string | null;
      created_at: string;
      metadata: Record<string, unknown> | null;
    }>(`
      SELECT id, display_id, email, created_at, metadata
      FROM "order"
      WHERE deleted_at IS NULL
        -- Medusa stores the US-spelled enum value: canceled.
        AND status <> 'canceled'
      ORDER BY created_at DESC
      LIMIT 100
    `);
    const orders = result.rows
      .map(getDeliverableOrder)
      .filter((order): order is DebugDeliverableOrder => Boolean(order));
    const pendingResult = await db.query<{
      order_id: string;
      display_id: string | number | null;
      email: string | null;
      vendor_count: string | number;
      pending_amount: string | number;
      unlock_at: string | null;
    }>(`
      SELECT
        vel.order_id,
        COALESCE(o.display_id::text, vel.order_display_id, vel.order_id) AS display_id,
        o.email,
        COUNT(DISTINCT vel.vendor_id) AS vendor_count,
        SUM(vel.net_amount) AS pending_amount,
        MIN(vel.unlock_at) AS unlock_at
      FROM vendor_earnings_log vel
      LEFT JOIN "order" o ON o.id = vel.order_id
      WHERE vel.status = 'UNLOCKING'
        AND vel.net_amount <> 0
      GROUP BY vel.order_id, o.display_id, vel.order_display_id, o.email
      ORDER BY MIN(vel.unlock_at) ASC NULLS LAST
      LIMIT 100
    `);
    const pendingOrders: DebugPendingSettlementOrder[] = pendingResult.rows.map((row) => ({
      orderId: row.order_id,
      displayId: String(row.display_id || row.order_id),
      email: row.email,
      vendorCount: Number(row.vendor_count) || 0,
      pendingAmount: Number(row.pending_amount) || 0,
      unlockAt: row.unlock_at,
    }));
    return NextResponse.json({ orders, pendingOrders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list deliverable orders" },
      { status: 500 }
    );
  }
}
