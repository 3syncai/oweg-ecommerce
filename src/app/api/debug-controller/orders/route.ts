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

type WorkflowMap = Record<string, Record<string, unknown>>;

function isDeliveredWorkflow(workflow: Record<string, unknown>): boolean {
  const stage = String(workflow.stage || "").toLowerCase();
  const tracking = String(workflow.shiprocket_status || "").toLowerCase();
  return (
    stage === "delivered" ||
    tracking === "delivered" ||
    typeof workflow.debug_marked_delivered_at === "string"
  );
}

function isDispatchOrTransitWorkflow(workflow: Record<string, unknown>): boolean {
  const stage = String(workflow.stage || "").toLowerCase();
  const tracking = String(workflow.shiprocket_status || "").toLowerCase();
  return (
    stage === "to_dispatch" ||
    stage === "in_transit" ||
    tracking.includes("transit") ||
    tracking.includes("dispatch")
  );
}

function resolveSliceDisplayId(
  parentDisplayId: string,
  vendorId: string,
  workflow: Record<string, unknown>,
  vendorIds: string[]
): string {
  const fromWorkflow = String(workflow.vendor_display_id || "").trim();
  if (fromWorkflow) return fromWorkflow;
  if (parentDisplayId && vendorIds.length > 1) {
    const index = vendorIds.indexOf(vendorId);
    if (index >= 0) return `${parentDisplayId}-${index + 1}`;
  }
  return parentDisplayId || vendorId;
}

function vendorLabel(workflow: Record<string, unknown>, vendorId: string): string {
  return (
    String(workflow.store_name || "").trim() ||
    String(workflow.vendor_name || "").trim() ||
    vendorId.slice(-8)
  );
}

/**
 * One deliverable row per vendor slice so multi-seller orders show as
 * #1259-1 / #1259-2 instead of a single parent #1259.
 */
function getDeliverableSlices(row: {
  id: string;
  display_id: string | number | null;
  email: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}): DebugDeliverableOrder[] {
  const metadata = row.metadata || {};
  const workflows = (metadata.vendor_order_workflows || {}) as WorkflowMap;
  const parentDisplayId = String(row.display_id || row.id);
  const vendorIds = Object.keys(workflows).sort();

  if (vendorIds.length > 0) {
    const slices: DebugDeliverableOrder[] = [];
    for (const vendorId of vendorIds) {
      const workflow = workflows[vendorId] || {};
      const stage = String(workflow.stage || "").toLowerCase();
      // Skip settlement-only stubs that never entered fulfillment.
      if (!stage && !workflow.accepted_at && !workflow.rtd_at) continue;

      const delivered = isDeliveredWorkflow(workflow);
      const active = isDispatchOrTransitWorkflow(workflow);
      if (!delivered && !active) continue;

      const inTransit =
        stage === "in_transit" ||
        String(workflow.shiprocket_status || "")
          .toLowerCase()
          .includes("transit");

      slices.push({
        id: row.id,
        displayId: resolveSliceDisplayId(parentDisplayId, vendorId, workflow, vendorIds),
        email: row.email,
        createdAt: row.created_at,
        stage: delivered ? "delivered" : inTransit ? "in_transit" : "to_dispatch",
        vendorId,
        vendorLabel: vendorLabel(workflow, vendorId),
        vendors: [vendorId],
      });
    }
    return slices;
  }

  // Legacy single-vendor / no-workflow orders: keep one parent row.
  const debugDeliveredAt =
    typeof metadata.debug_marked_delivered_at === "string"
      ? metadata.debug_marked_delivered_at
      : null;
  const rootStatus = String(metadata.shiprocket_status || "").toLowerCase();
  if (debugDeliveredAt) {
    return [
      {
        id: row.id,
        displayId: parentDisplayId,
        email: row.email,
        createdAt: row.created_at,
        stage: "delivered",
        vendorId: null,
        vendorLabel: null,
        vendors: [],
      },
    ];
  }
  if (!rootStatus.includes("transit") && !rootStatus.includes("dispatch")) {
    return [];
  }
  return [
    {
      id: row.id,
      displayId: parentDisplayId,
      email: row.email,
      createdAt: row.created_at,
      stage: rootStatus.includes("transit") ? "in_transit" : "to_dispatch",
      vendorId: null,
      vendorLabel: null,
      vendors: [],
    },
  ];
}

export async function GET(req: NextRequest) {
  if (!verifyDebugControllerToken(extractDebugAuthToken(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getDebugControllerPool();
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
    const orders = result.rows.flatMap(getDeliverableSlices);
    const pendingResult = await db.query<{
      order_id: string;
      display_id: string | number | null;
      email: string | null;
      vendor_count: string | number;
      commission_count: string | number;
      pending_amount: string | number;
      unlock_at: string | null;
    }>(`
      WITH pending AS (
        SELECT order_id, vendor_id, net_amount AS amount, unlock_at,
               order_display_id::text AS display_id, false AS commission
        FROM vendor_earnings_log WHERE status = 'UNLOCKING' AND net_amount <> 0
        UNION ALL
        SELECT order_id, NULL AS vendor_id, affiliate_commission AS amount, unlock_at,
               NULL AS display_id, true AS commission
        FROM affiliate_commission_log WHERE status = 'PENDING' AND affiliate_commission > 0
      )
      SELECT p.order_id, COALESCE(o.display_id::text, MAX(p.display_id), p.order_id) AS display_id,
        o.email, COUNT(DISTINCT p.vendor_id) AS vendor_count,
        COUNT(*) FILTER (WHERE p.commission) AS commission_count,
        SUM(p.amount) AS pending_amount, MIN(p.unlock_at) AS unlock_at
      FROM pending p JOIN "order" o ON o.id = p.order_id
      WHERE o.status <> 'canceled' AND o.deleted_at IS NULL
      GROUP BY p.order_id, o.display_id, o.email
      ORDER BY MIN(p.unlock_at) ASC NULLS LAST LIMIT 100
    `);
    const pendingOrders: DebugPendingSettlementOrder[] = pendingResult.rows.map((row) => ({
      orderId: row.order_id,
      displayId: String(row.display_id || row.order_id),
      email: row.email,
      vendorCount: Number(row.vendor_count) || 0,
      commissionCount: Number(row.commission_count) || 0,
      pendingAmount: Number(row.pending_amount) || 0,
      unlockAt: row.unlock_at,
    }));
    return NextResponse.json({ orders, pendingOrders });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to list deliverable orders. Set ENABLE_DEBUG_CONTROLLER=true and DATABASE_URL on the storefront.",
      },
      { status: 500 }
    );
  }
}
