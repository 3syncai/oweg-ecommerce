import { NextResponse } from "next/server";
import { createRazorpayOrder, getPublicRazorpayKey } from "@/lib/razorpay";
import { convertDraftOrder, getOrderById, updateOrderMetadata } from "@/lib/medusa-admin";
import { Pool } from 'pg';

export const dynamic = "force-dynamic";

// Module-level database pool singleton to avoid connection exhaustion
let dbPool: Pool | null = null;
function getDbPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!dbPool) {
    dbPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1, // Limit connections for this route
      idleTimeoutMillis: 30000,
    });
  }
  return dbPool;
}

const DEFAULT_CURRENCY = "INR";

type RequestBody = {
  medusaOrderId?: string;
  amount?: number;
};

type MedusaOrder = {
  id?: string;
  metadata?: Record<string, unknown>;
  currency_code?: string;
  total?: number;
};

function extractOrder(data: unknown): MedusaOrder | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const direct = root.order;
  if (direct && typeof direct === "object") return direct as MedusaOrder;
  const nested = root.data;
  if (nested && typeof nested === "object") {
    const nestedOrder = (nested as Record<string, unknown>).order;
    if (nestedOrder && typeof nestedOrder === "object") return nestedOrder as MedusaOrder;
    if (Array.isArray(nested) && nested[0] && typeof nested[0] === "object") {
      return nested[0] as MedusaOrder;
    }
  }
  return root as MedusaOrder;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    // Only log non-sensitive identifiers for debugging
    console.log("[Razorpay] Processing order:", body.medusaOrderId?.trim() || "N/A");

    let medusaOrderId = body.medusaOrderId?.trim();

    if (!medusaOrderId) {
      return badRequest("medusaOrderId is required");
    }

    let order: MedusaOrder | null = null;

    const orderRes = await getOrderById(medusaOrderId);
    if (orderRes.ok && orderRes.data && extractOrder(orderRes.data)) {
      order = extractOrder(orderRes.data);
    } else {
      // If we only have a draft id, convert it so Razorpay can reference a real order
      const converted = await convertDraftOrder(medusaOrderId);
      if (converted.ok) {
        const convertedOrder = extractOrder(converted.data);
        if (convertedOrder?.id) {
          medusaOrderId = convertedOrder.id;
          order = convertedOrder;
        }
      }
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const currency = (order.currency_code || DEFAULT_CURRENCY).toString().toUpperCase();
    // order.total is in rupees - pass as-is to razorpay helper which will convert to paise
    const totalRupees = Number.isFinite(Number(order.total ?? 0)) ? Number(order.total ?? 0) : 0;
    if (totalRupees <= 0) {
      return badRequest("Order total is invalid");
    }

    // SECURITY FIX: Server-side validation of payment amount
    // Don't trust client-provided amounts - verify coin discount from database
    let finalAmount = totalRupees;
    let verifiedCoinDiscount = 0;

    // Step 1: Fetch actual coin discount from wallet_transactions table
    const pool = getDbPool();
    if (pool) {
      try {
        const discountQuery = await pool.query(
          `SELECT amount FROM wallet_transactions 
           WHERE order_id = $1 
           AND transaction_type = 'REDEEMED'
           AND status = 'USED'
           ORDER BY created_at DESC 
           LIMIT 1`,
          [medusaOrderId]
        );

        if (discountQuery.rows.length > 0) {
          // amount is stored in paise (integer), use integer arithmetic then divide
          // This avoids parseFloat precision issues
          verifiedCoinDiscount = Number(discountQuery.rows[0].amount) / 100;
          console.log(`💰 [Razorpay] Verified coin discount: ₹${verifiedCoinDiscount}`);
        }
      } catch (dbErr) {
        console.error("[Razorpay] Failed to verify coin discount:", dbErr);
        // Continue without discount if DB fails
      }
      // Note: pool is module-level singleton, don't end it
    }

    // Step 2: Calculate server-verified final amount
    finalAmount = totalRupees - verifiedCoinDiscount;

    // Ensure final amount is never negative (data corruption or race condition protection)
    if (finalAmount < 0) {
      console.error(`🚨 [Razorpay] Invalid discount: ₹${verifiedCoinDiscount} exceeds order total ₹${totalRupees}`);
      return badRequest("Discount amount exceeds order total");
    }

    // Step 3: Validate frontend amount matches server calculation (1 rupee tolerance for rounding)
    const requestedAmount = Number(body.amount);
    if (!isNaN(requestedAmount) && requestedAmount > 0) {
      if (Math.abs(requestedAmount - finalAmount) > 1) {
        console.error(`🚨 [Razorpay Security] Amount mismatch! Server: ${finalAmount}, Client: ${requestedAmount}`);
        return badRequest(`Payment amount mismatch. Expected ₹${finalAmount.toFixed(2)}`);
      }
    }

    const metadata = (order.metadata || {}) as Record<string, unknown>;
    if (typeof metadata.razorpay_order_id === "string" && metadata.razorpay_order_id) {
      // Check if cached order amount still matches (after applying verified discount)
      const cachedAmount = Number(metadata.razorpay_cached_amount);
      if (!isNaN(cachedAmount) && Math.abs(cachedAmount - finalAmount) <= 1) {
        return NextResponse.json({
          orderId: metadata.razorpay_order_id,
          key: getPublicRazorpayKey(),
          amount: finalAmount, // Return server-calculated amount, not totalRupees
          currency,
        });
      }
      // Amount changed (e.g., coin discount applied/removed), fall through to create new order
      console.log("💰 [Razorpay Refresh] Amount changed, creating new order");
    }

    const rzpOrder = await createRazorpayOrder(
      {
        amount: finalAmount, // Use the forced amount
        currency,
        receipt: medusaOrderId,
        notes: {
          medusa_order_id: medusaOrderId,
        },
      },
      { amountIsPaise: false }
    );

    const nextMetadata = {
      ...metadata,
      razorpay_order_id: rzpOrder.id,
      razorpay_payment_status: "created",
      razorpay_cached_amount: finalAmount, // Store amount for cache validation
    };

    await updateOrderMetadata(medusaOrderId, nextMetadata);

    return NextResponse.json({
      orderId: rzpOrder.id,
      key: getPublicRazorpayKey(),
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to create Razorpay order";
    console.error("create-razorpay-order failed", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
