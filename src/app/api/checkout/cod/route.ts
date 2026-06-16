import { NextResponse } from "next/server";
import { convertDraftOrder, getOrderById, updateOrderMetadata } from "@/lib/medusa-admin";
import { applyCoinDiscountToOrder } from "@/lib/order-discount";
import { OWEG10_CODE } from "@/lib/oweg10-shared";
import { consumeOweg10Reservation, syncOweg10ConsumedCustomerMetadata } from "@/lib/oweg10";
import { logPendingCoinsForOrder } from "@/lib/customer-affiliate-coins";
import { getPool } from "@/lib/wallet-ledger";

export const dynamic = "force-dynamic";

type Body = {
  medusaOrderId?: string;
};

type MedusaOrder = {
  id?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  is_draft_order?: boolean;
  customer_id?: string;
};

function isDraftOrder(order: MedusaOrder | null): boolean {
  if (!order) return true;
  if (order.is_draft_order) return true;
  const status = typeof order.status === "string" ? order.status.toLowerCase() : "";
  return status === "draft";
}

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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function runCodSideEffects(finalOrderId: string, metadata: Record<string, unknown>) {
  try {
    const coinMinor =
      typeof metadata.coin_discount_minor === "number"
        ? metadata.coin_discount_minor
        : typeof metadata.coin_discount_rupees === "number"
          ? Math.round(metadata.coin_discount_rupees * 100)
          : 0;
    if (coinMinor > 0) {
      await applyCoinDiscountToOrder({
        orderId: finalOrderId,
        discountMinor: coinMinor,
      });
    }
  } catch (coinErr) {
    console.error("cod post-process: coin discount update failed", coinErr);
  }

  try {
    const pool = getPool();
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
    const webhookUrl = process.env.AFFILIATE_WEBHOOK_URL;

    if (affiliateCode && webhookUrl) {
      const itemsResult = await pool.query(
        `SELECT oi.id, pv.product_id, oi.quantity, oli.unit_price, p.title as product_name
         FROM order_item oi
         JOIN order_line_item oli ON oi.item_id = oli.id
         LEFT JOIN product_variant pv ON oli.variant_id = pv.id
         LEFT JOIN product p ON pv.product_id = p.id
         WHERE oi.order_id = $1`,
        [finalOrderId]
      );

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

        await fetchWithTimeout(
          webhookUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
          5000
        ).catch((err) => {
          console.error("cod post-process: affiliate webhook item failed", err);
        });
      }
    } else if (affiliateCode && !webhookUrl) {
      console.warn("cod post-process: AFFILIATE_WEBHOOK_URL not set, skipping commission webhook");
    }
  } catch (err) {
    console.error("cod post-process: affiliate commission failed", err);
  }

  try {
    const result = await logPendingCoinsForOrder(finalOrderId);
    console.log("[customer-affiliate-coins] cod post-process:", result);
  } catch (err) {
    console.error("[customer-affiliate-coins] cod post-process failed:", err);
  }

  try {
    await updateOrderMetadata(finalOrderId, {
      cod_post_process_done: true,
      cod_post_process_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("cod post-process: failed to mark completion metadata", err);
  }
}

function scheduleCodSideEffects(finalOrderId: string, metadata: Record<string, unknown>) {
  if (metadata.cod_post_process_done === true) {
    return;
  }
  void runCodSideEffects(finalOrderId, metadata).catch((err) => {
    console.error("cod post-process: unhandled failure", err);
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    let medusaOrderId = body.medusaOrderId?.trim();
    if (!medusaOrderId) return badRequest("medusaOrderId is required");

    let order: MedusaOrder | null = null;
    const orderRes = await getOrderById(medusaOrderId);
    if (orderRes.ok && orderRes.data) {
      order = extractOrder(orderRes.data);
    }

    if (!order && orderRes.status !== 404) {
      if (orderRes.status === 0) {
        return NextResponse.json(
          { error: "Medusa admin backend is temporarily unavailable. Please retry." },
          { status: 503 }
        );
      }
    }

    if (isDraftOrder(order)) {
      const converted = await convertDraftOrder(medusaOrderId);
      if (!converted.ok) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      order = extractOrder(converted.data);
      if (order?.id) {
        medusaOrderId = order.id;
      }
    }

    if (!order?.id) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const metadata = (order.metadata || {}) as Record<string, unknown>;
    const codStatus = typeof metadata.cod_status === "string" ? metadata.cod_status : undefined;
    let finalOrderId = order.id;

    if (codStatus === "confirmed") {
      if (isDraftOrder(order)) {
        const converted = await convertDraftOrder(medusaOrderId);
        if (converted.ok) {
          const convertedOrder = extractOrder(converted.data);
          if (convertedOrder?.id) {
            order = convertedOrder;
            finalOrderId = convertedOrder.id;
          }
        }
      }
      scheduleCodSideEffects(finalOrderId, metadata);
      return NextResponse.json({ ok: true, medusaOrderId: finalOrderId, status: "confirmed" });
    }

    const oweg10ReservationToken =
      typeof metadata.oweg10_reservation_token === "string" ? metadata.oweg10_reservation_token : undefined;
    const oweg10CustomerId =
      typeof metadata.oweg10_customer_id === "string"
        ? metadata.oweg10_customer_id
        : typeof order.customer_id === "string"
          ? order.customer_id
          : undefined;

    const razorpayStatus =
      typeof metadata.razorpay_payment_status === "string" ? metadata.razorpay_payment_status : undefined;
    const isOweg10Order =
      typeof metadata.oweg10_code === "string" && metadata.oweg10_code.toUpperCase() === OWEG10_CODE;
    const confirmedMetadata = {
      ...metadata,
      payment_method: "cod",
      cod_status: "confirmed",
      razorpay_payment_status: razorpayStatus || "cod",
      oweg10_pending: isOweg10Order ? metadata.oweg10_pending : false,
      oweg10_consumed: isOweg10Order ? metadata.oweg10_consumed : undefined,
      oweg10_consumed_at: isOweg10Order ? metadata.oweg10_consumed_at : undefined,
    };

    await updateOrderMetadata(finalOrderId, confirmedMetadata);

    if (oweg10ReservationToken && oweg10CustomerId && !metadata.oweg10_consumed) {
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
          await updateOrderMetadata(finalOrderId, metadata).catch((rollbackError) => {
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
        await updateOrderMetadata(finalOrderId, metadata).catch((rollbackError) => {
          console.error("cod confirm: failed to roll back metadata after OWEG10 consume error", rollbackError);
        });
        console.error("cod confirm: OWEG10 consume failed", consumeError);
        return oweg10ConflictResponse("expired");
      }
    }

    scheduleCodSideEffects(finalOrderId, confirmedMetadata);

    return NextResponse.json({ ok: true, medusaOrderId: finalOrderId, status: "confirmed" });
  } catch (err) {
    console.error("cod confirm error", err);
    return NextResponse.json({ error: "Unable to confirm COD order" }, { status: 500 });
  }
}
