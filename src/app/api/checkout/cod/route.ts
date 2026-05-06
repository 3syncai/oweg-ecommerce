import { NextResponse } from "next/server";
import { convertDraftOrder, getOrderById, updateOrderMetadata } from "@/lib/medusa-admin";
import { applyCoinDiscountToOrder } from "@/lib/order-discount";
import { OWEG10_CODE } from "@/lib/oweg10-shared";
import { consumeOweg10Reservation, syncOweg10ConsumedCustomerMetadata } from "@/lib/oweg10";
import { logPendingCoinsForOrder } from "@/lib/customer-affiliate-coins";

export const dynamic = "force-dynamic";

type Body = {
  medusaOrderId?: string;
};

type MedusaOrder = {
  id?: string;
  metadata?: Record<string, unknown>;
  is_draft_order?: boolean;
  customer_id?: string;
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

function oweg10ConflictResponse(reason: string) {
  return NextResponse.json(
    {
      error:
        reason === "consumed"
          ? `${OWEG10_CODE} has already been used on this account.`
          : `${OWEG10_CODE} reservation expired. Please retry checkout.`,
    },
    { status: 409 }
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    let medusaOrderId = body.medusaOrderId?.trim();
    if (!medusaOrderId) return badRequest("medusaOrderId is required");

    let order: MedusaOrder | null = null;

    const orderRes = await getOrderById(medusaOrderId);
    if (orderRes.ok && orderRes.data && extractOrder(orderRes.data)) {
      order = extractOrder(orderRes.data);
    } else {
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

    const metadata = (order.metadata || {}) as Record<string, unknown>;
    const codStatus = typeof metadata.cod_status === "string" ? metadata.cod_status : undefined;

    if (codStatus === "confirmed") {
      return NextResponse.json({ ok: true, medusaOrderId, status: "confirmed" });
    }

    let finalOrderId = medusaOrderId;
    if (order.is_draft_order) {
      const converted = await convertDraftOrder(medusaOrderId);
      if (converted.ok) {
        const convertedOrder = extractOrder(converted.data) || order;
        finalOrderId = convertedOrder?.id || medusaOrderId;
      }
    }

    const finalOrderRes = await getOrderById(finalOrderId);
    const finalOrder = finalOrderRes.ok && finalOrderRes.data ? extractOrder(finalOrderRes.data) || order : order;
    const finalMetadata = (finalOrder?.metadata || metadata) as Record<string, unknown>;
    const oweg10ReservationToken =
      typeof finalMetadata.oweg10_reservation_token === "string"
        ? finalMetadata.oweg10_reservation_token
        : undefined;
    const oweg10CustomerId =
      typeof finalMetadata.oweg10_customer_id === "string"
        ? finalMetadata.oweg10_customer_id
        : typeof finalOrder?.customer_id === "string"
          ? finalOrder.customer_id
          : undefined;

    const razorpayStatus =
      typeof finalMetadata.razorpay_payment_status === "string"
        ? finalMetadata.razorpay_payment_status
        : undefined;
    const isOweg10Order =
      typeof finalMetadata.oweg10_code === "string" && finalMetadata.oweg10_code.toUpperCase() === OWEG10_CODE;
    const confirmedMetadata = {
      ...finalMetadata,
      payment_method: "cod",
      cod_status: "confirmed",
      razorpay_payment_status: razorpayStatus || "cod",
      oweg10_pending: isOweg10Order ? finalMetadata.oweg10_pending : false,
      oweg10_consumed: isOweg10Order ? finalMetadata.oweg10_consumed : undefined,
      oweg10_consumed_at: isOweg10Order ? finalMetadata.oweg10_consumed_at : undefined,
    };

    await updateOrderMetadata(finalOrderId, confirmedMetadata);

    if (oweg10ReservationToken && oweg10CustomerId) {
      try {
        const consumeResult = await consumeOweg10Reservation({
          customerId: oweg10CustomerId,
          reservationToken: oweg10ReservationToken,
          orderId: finalOrderId,
          metadata: {
            payment_method: "cod",
            source: "cod-confirm",
          },
        });

        if (!consumeResult.ok) {
          await updateOrderMetadata(finalOrderId, finalMetadata).catch((rollbackError) => {
            console.error("cod confirm: failed to roll back metadata after OWEG10 consume rejection", rollbackError);
          });
          return oweg10ConflictResponse(consumeResult.reason);
        }

        await syncOweg10ConsumedCustomerMetadata(oweg10CustomerId);
        await updateOrderMetadata(finalOrderId, {
          ...confirmedMetadata,
          oweg10_pending: false,
          oweg10_consumed: true,
          oweg10_consumed_at: new Date().toISOString(),
          oweg10_code: OWEG10_CODE,
        });
      } catch (consumeError) {
        await updateOrderMetadata(finalOrderId, finalMetadata).catch((rollbackError) => {
          console.error("cod confirm: failed to roll back metadata after OWEG10 consume error", rollbackError);
        });
        console.error("cod confirm: OWEG10 consume failed", consumeError);
        return oweg10ConflictResponse("expired");
      }
    }

    // 1. UPDATED UPSTREAM: Coin Discount Logic
    try {
      const refreshed = await getOrderById(finalOrderId);
      const refreshedOrder = refreshed.ok && refreshed.data ? extractOrder(refreshed.data) : order;
      const refreshedMeta = (refreshedOrder?.metadata || {}) as Record<string, unknown>;
      const coinMinor =
        typeof refreshedMeta?.coin_discount_minor === "number"
          ? refreshedMeta.coin_discount_minor
          : typeof refreshedMeta?.coin_discount_rupees === "number"
            ? Math.round(refreshedMeta.coin_discount_rupees * 100)
            : 0;
      if (coinMinor > 0) {
        await applyCoinDiscountToOrder({
          orderId: finalOrderId,
          discountMinor: coinMinor
        });
      }
    } catch (coinErr) {
      console.error("cod confirm: coin discount update failed", coinErr);
    }

    // 2. STASHED CHANGE: Affiliate Commission Webhook (Robustness)
    try {
      console.log("cod confirm: Triggering commission webhook...");
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });

      // Get customer and order items
      const customerResult = await pool.query(
        `SELECT
            c.id,
            c.email,
            c.first_name || ' ' || c.last_name as name,
            COALESCE(cr.referral_code, c.metadata->>'referral_code') as referral_code
         FROM "order" o
         JOIN customer c ON o.customer_id = c.id
         LEFT JOIN customer_referral cr ON cr.customer_id = c.id
         WHERE o.id = $1`,
        [finalOrderId]
      );

      const customer = customerResult.rows[0];
      const affiliateCode = customer?.referral_code;

      if (affiliateCode) {
        const itemsResult = await pool.query(
          `SELECT oi.id, pv.product_id, oi.quantity, oli.unit_price, p.title as product_name
           FROM order_item oi
           JOIN order_line_item oli ON oi.item_id = oli.id
           LEFT JOIN product_variant pv ON oli.variant_id = pv.id
           LEFT JOIN product p ON pv.product_id = p.id
           WHERE oi.order_id = $1`,
          [finalOrderId]
        );

        const webhookUrl = process.env.AFFILIATE_WEBHOOK_URL;

        if (!webhookUrl) {
          console.error("⚠️ AFFILIATE_WEBHOOK_URL not set, skipping commission webhook");
          await pool.end();
          return NextResponse.json({ ok: true, medusaOrderId: finalOrderId, status: "confirmed" });
        }

        for (const item of itemsResult.rows) {
          const unitPrice = parseFloat(item.unit_price || 0);
          const payload = {
            order_id: finalOrderId,
            affiliate_code: affiliateCode,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            item_price: unitPrice / 100,
            order_amount: unitPrice * (item.quantity || 1),
            status: "PENDING",
            customer_id: customer.id,
            customer_name: customer.name,
            customer_email: customer.email,
          };

          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        console.log("✅ COD commission webhook triggered");
      }
      await pool.end();
    } catch (err) {
      console.error("⚠️ COD commission webhook failed:", err);
    }

    // Customer-affiliate coins (separate from agent affiliate above)
    try {
      const result = await logPendingCoinsForOrder(finalOrderId);
      console.log("[customer-affiliate-coins] cod confirm:", result);
    } catch (err) {
      console.error("[customer-affiliate-coins] cod confirm failed:", err);
    }

    return NextResponse.json({ ok: true, medusaOrderId: finalOrderId, status: "confirmed" });
  } catch (err) {
    console.error("cod confirm error", err);
    return NextResponse.json({ error: "Unable to confirm COD order" }, { status: 500 });
  }
}
