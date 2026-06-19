import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Pool } from "pg";
import client from "@/lib/opensearch";
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

export async function POST(req: NextRequest) {
  const token = extractDebugAuthToken(req);
  if (!verifyDebugControllerToken(token)) {
    return unauthorized();
  }

  const body = (await req.json().catch(() => null)) as
    | { action?: DebugAction; productId?: string; days?: number }
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
