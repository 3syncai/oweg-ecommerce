import { forceSettleDebugOrder } from "@/lib/debug-controller/settlement";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Pool } from "pg";
import client from "@/lib/opensearch";
import { scheduleVendorEarningsOnDelivery } from "@/lib/vendor-earnings";
import {
  extractDebugAuthToken,
  verifyDebugControllerToken,
} from "@/lib/debug-controller/auth";
import type { DebugAction } from "@/lib/debug-controller/types";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function cleanupTestPayments() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const payments = await pool.query(`
      DELETE FROM payment
      WHERE created_at > now() - interval '1 day'
      RETURNING id
    `);
    const sessions = await pool.query(`
      DELETE FROM payment_session
      WHERE created_at > now() - interval '1 day'
      RETURNING id
    `);
    const links = await pool.query(`
      DELETE FROM order_payment_collection
      WHERE created_at > now() - interval '1 day'
      RETURNING id
    `);
    const collections = await pool.query(`
      DELETE FROM payment_collection
      WHERE created_at > now() - interval '1 day'
        AND metadata->>'cart_id' IS NOT NULL
      RETURNING id
    `);

    return {
      payments: payments.rowCount,
      sessions: sessions.rowCount,
      links: links.rowCount,
      collections: collections.rowCount,
    };
  } finally {
    await pool.end();
  }
}

async function purgeAbandonedCarts(days = 7) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      `
        DELETE FROM cart
        WHERE deleted_at IS NULL
          AND completed_at IS NULL
          AND updated_at < now() - ($1 || ' days')::interval
        RETURNING id
      `,
      [String(days)]
    );
    return { deleted: result.rowCount };
  } finally {
    await pool.end();
  }
}

async function removeOpenSearchProduct(productId: string) {
  const index = process.env.OPENSEARCH_PRODUCTS_INDEX || "products";
  try {
    await client.delete({
      index,
      id: productId,
    });
  } catch (error: unknown) {
    const statusCode =
      error &&
      typeof error === "object" &&
      "meta" in error &&
      (error as { meta?: { statusCode?: number } }).meta?.statusCode;
    if (statusCode !== 404) {
      throw error;
    }
  }
  return { index, productId };
}

async function syncOpenSearchIndex() {
  const index = process.env.OPENSEARCH_PRODUCTS_INDEX || "products";
  const exists = await client.indices.exists({ index });
  const body = exists.body ?? exists;
  if (!body) {
    await client.indices.create({
      index,
      body: {
        settings: { number_of_shards: 1, number_of_replicas: 0 },
      },
    });
  }
  return {
    index,
    message: "Index verified. Run my-medusa-store/scripts/sync-products-to-search.ts for full sync.",
  };
}

async function markOrderDelivered(orderId: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query<{
      metadata: Record<string, unknown> | null;
      status: string | null;
    }>(`SELECT metadata, status FROM "order" WHERE id = $1 AND deleted_at IS NULL LIMIT 1`, [orderId]);
    const order = result.rows[0];
    if (!order) throw new Error("Order not found");
    if (["canceled", "cancelled"].includes(String(order.status || "").toLowerCase())) {
      throw new Error("Cancelled orders cannot be marked delivered");
    }

    const metadata = { ...(order.metadata || {}) } as Record<string, any>;
    const workflows = { ...(metadata.vendor_order_workflows || {}) } as Record<string, any>;
    const eligibleVendors = Object.entries(workflows).filter(([, workflow]) => {
      const stage = String(workflow?.stage || "").toLowerCase();
      const tracking = String(workflow?.shiprocket_status || "").toLowerCase();
      return stage === "to_dispatch" || stage === "in_transit" || tracking.includes("transit") || tracking.includes("dispatch");
    });
    const rootStatus = String(metadata.shiprocket_status || "").toLowerCase();
    if (!eligibleVendors.length && !rootStatus.includes("transit") && !rootStatus.includes("dispatch")) {
      throw new Error("Only dispatch or in-transit orders can be marked delivered");
    }

    const deliveredAt = new Date().toISOString();
    for (const [vendorId, workflow] of eligibleVendors) {
      workflows[vendorId] = {
        ...workflow,
        stage: "delivered",
        shiprocket_status: "delivered",
        shiprocket_delivered_at: deliveredAt,
        debug_marked_delivered_at: deliveredAt,
        updated_at: deliveredAt,
      };
    }
    metadata.vendor_order_workflows = workflows;
    // Do not mark the whole order as delivered while another vendor's slice
    // is still moving through dispatch/in-transit.
    const allVendorWorkflowsDelivered = Object.values(workflows).every((workflow: any) => {
      const stage = String(workflow?.stage || "").toLowerCase();
      const tracking = String(workflow?.shiprocket_status || "").toLowerCase();
      return stage === "delivered" || tracking === "delivered";
    });
    if (!Object.keys(workflows).length || allVendorWorkflowsDelivered) {
      metadata.shiprocket_status = "delivered";
      metadata.shiprocket_delivered_at = deliveredAt;
    }
    metadata.debug_marked_delivered_at = deliveredAt;

    await pool.query(
      `UPDATE "order" SET metadata = $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(metadata), orderId]
    );
    const vendorIds = eligibleVendors.map(([vendorId]) => vendorId);
    const earnings = await scheduleVendorEarningsOnDelivery(orderId, pool, {
      deliveredAt: new Date(deliveredAt),
      ...(vendorIds.length ? { vendorIds } : {}),
    });
    return { orderId, deliveredAt, vendorIds, earnings };
  } finally {
    await pool.end();
  }
}

async function syncDebugDeliveryLedger(orderId: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query<{ metadata: Record<string, unknown> | null }>(
      `SELECT metadata FROM "order" WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [orderId]
    );
    const metadata = result.rows[0]?.metadata || {};
    const deliveredAt = typeof metadata.debug_marked_delivered_at === "string"
      ? new Date(metadata.debug_marked_delivered_at)
      : null;
    if (!deliveredAt || Number.isNaN(deliveredAt.getTime())) {
      throw new Error("This order was not delivered through the debug controller");
    }
    const workflows = metadata.vendor_order_workflows as Record<string, unknown> | undefined;
    const earnings = await scheduleVendorEarningsOnDelivery(orderId, pool, {
      deliveredAt,
      vendorIds: Object.keys(workflows || {}),
    });
    return { orderId, earnings };
  } finally {
    await pool.end();
  }
}

/** Test-only: release vendor and partner/admin earnings in one transaction. */
async function forceSettlePendingOrder(orderId: string) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await forceSettleDebugOrder(pool, orderId);
  } finally {
    await pool.end();
  }
}

export async function POST(req: NextRequest) {
  const token = extractDebugAuthToken(req);
  if (!verifyDebugControllerToken(token)) {
    return unauthorized();
  }

  const body = (await req.json().catch(() => null)) as
    | { action?: DebugAction; productId?: string; orderId?: string; days?: number }
    | null;

  const action = body?.action;
  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  try {
    switch (action) {
      case "cleanup-test-payments": {
        const deleted = await cleanupTestPayments();
        return NextResponse.json({ success: true, deleted });
      }
      case "purge-abandoned-carts": {
        const days = body?.days && body.days > 0 ? body.days : 7;
        const result = await purgeAbandonedCarts(days);
        return NextResponse.json({ success: true, ...result, days });
      }
      case "revalidate-all": {
        revalidatePath("/", "layout");
        revalidatePath("/products", "layout");
        revalidatePath("/brands", "layout");
        return NextResponse.json({ success: true, revalidated: ["/", "/products", "/brands"] });
      }
      case "remove-opensearch-product": {
        if (!body?.productId) {
          return NextResponse.json({ error: "productId required" }, { status: 400 });
        }
        const result = await removeOpenSearchProduct(body.productId);
        return NextResponse.json({ success: true, ...result });
      }
      case "sync-opensearch-index": {
        const result = await syncOpenSearchIndex();
        return NextResponse.json({ success: true, ...result });
      }
      case "clear-flash-sale-cache": {
        revalidatePath("/flash-sale");
        revalidatePath("/");
        return NextResponse.json({ success: true, message: "Flash sale cache cleared" });
      }
      case "mark-order-delivered": {
        if (!body?.orderId) {
          return NextResponse.json({ error: "orderId required" }, { status: 400 });
        }
        const result = await markOrderDelivered(body.orderId);
        return NextResponse.json({ success: true, ...result });
      }
      case "sync-debug-delivery-ledger": {
        if (!body?.orderId) {
          return NextResponse.json({ error: "orderId required" }, { status: 400 });
        }
        const result = await syncDebugDeliveryLedger(body.orderId);
        return NextResponse.json({ success: true, ...result });
      }
      case "force-settle-pending-order": {
        if (!body?.orderId) {
          return NextResponse.json({ error: "orderId required" }, { status: 400 });
        }
        const result = await forceSettlePendingOrder(body.orderId);
        return NextResponse.json({ success: true, ...result });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
