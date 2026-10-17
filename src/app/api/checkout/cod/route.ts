import {transaction,consumeCheckoutCoins,enqueuePaymentWork,freezePaidOrderItems} from "@/lib/payment-reliability";
import { checkoutOrderAccessError } from "@/lib/checkout-order-access";
import { NextResponse, after } from "next/server";
import { convertDraftOrder, getOrderById, updateOrderMetadata } from "@/lib/medusa-admin";
import { loadCheckoutOrder } from "@/lib/checkout-order";
import { OWEG10_CODE } from "@/lib/oweg10-shared";
import { consumeOweg10Reservation, syncOweg10ConsumedCustomerMetadata } from "@/lib/oweg10";
import { getPool } from "@/lib/wallet-ledger";
import { getCheckoutGuardResponse } from "@/lib/debug-controller/guards";
import { ensurePlacedOrderFulfillmentReady } from "@/lib/medusa-payment";

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

/**
 * Only COD drafts may be confirmed here. Razorpay / failed online attempts must not
 * be force-converted into COD (that was leaking cancelled online pays into Shiprocket COD).
 */
function assertEligibleForCodConfirm(metadata: Record<string, unknown>): string | null {
  const paymentMethod =
    typeof metadata.payment_method === "string" ? metadata.payment_method.toLowerCase().trim() : "";
  const checkoutStatus =
    typeof metadata.checkout_status === "string" ? metadata.checkout_status.toLowerCase().trim() : "";
  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string"
      ? metadata.razorpay_payment_status.toLowerCase().trim()
      : "";

  if (checkoutStatus === "payment_failed") {
    return "This checkout failed online payment and cannot be confirmed as COD.";
  }

  if (["failed", "created", "attempted_failed"].includes(razorpayStatus)) {
    return "This order has an unpaid or failed online payment and cannot be confirmed as COD.";
  }

  // Allow explicit COD, or legacy drafts with no payment_method set.
  if (paymentMethod && paymentMethod !== "cod") {
    return `This order is marked as ${paymentMethod} and cannot be confirmed as COD.`;
  }

  return null;
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

async function scheduleCodSideEffects(orderId: string, _metadata: Record<string,unknown>) {
  await transaction(getPool(), async client=>{
    const order=(await client.query('SELECT customer_id,metadata FROM "order" WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
    if(!order || order.metadata?.payment_method!=="cod")throw new Error("not_cod_order");
    if(order.metadata.cod_post_process_done===true && order.metadata.payment_reliability_version!==1)return;
    await consumeCheckoutCoins(client,{orderId,customerId:order.customer_id,metadata:order.metadata});
    if(order.metadata.payment_reliability_version===1)await freezePaidOrderItems(client,{orderId,cashMinor:Number(order.metadata.medusa_total_minor),coinMinor:Number(order.metadata.coin_discount_minor||0),shippingMinor:Math.round(Number(order.metadata.expected_shipping_price||0)*100)});
    await enqueuePaymentWork(client,"payment_paid",orderId);
  });
}

export async function POST(req: Request) {
  const checkoutGuard = await getCheckoutGuardResponse();
  if (checkoutGuard) return checkoutGuard;

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    let medusaOrderId = body.medusaOrderId?.trim();
    if (!medusaOrderId) return badRequest("medusaOrderId is required");

    const accessError = await checkoutOrderAccessError(req, medusaOrderId);
    if (accessError) return accessError;

    let order: MedusaOrder | null = null;
    const loaded = await loadCheckoutOrder(medusaOrderId);
    if (loaded?.order?.id) {
      order = loaded.order as MedusaOrder;
    } else {
      const orderRes = await getOrderById(medusaOrderId);
      if (orderRes.ok && orderRes.data) {
        order = extractOrder(orderRes.data);
      }
      if (!order && orderRes.status !== 404 && orderRes.status === 0) {
        return NextResponse.json(
          { error: "Medusa admin backend is temporarily unavailable. Please retry." },
          { status: 503 }
        );
      }
    }

    if (!order?.id) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    let metadata = (order.metadata || {}) as Record<string, unknown>;
    const eligibilityError = assertEligibleForCodConfirm(metadata);
    if (eligibilityError) {
      return badRequest(eligibilityError);
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
      if (!order?.id) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      metadata = (order.metadata || metadata) as Record<string, unknown>;
    }

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
      // Idempotent: repair older COD orders that converted without reservations
      after(() =>
        ensurePlacedOrderFulfillmentReady(finalOrderId).catch((err) => {
          console.error("cod confirm: fulfillment readiness failed (idempotent)", err);
        })
      );
      await scheduleCodSideEffects(finalOrderId, metadata);
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

    await scheduleCodSideEffects(finalOrderId, confirmedMetadata);

    // Allocate stock async so success UI can flip to confirmed without waiting
    after(() =>
      ensurePlacedOrderFulfillmentReady(finalOrderId).catch((err) => {
        console.error("cod confirm: fulfillment readiness failed", err);
      })
    );

    return NextResponse.json({ ok: true, medusaOrderId: finalOrderId, status: "confirmed" });
  } catch (err) {
    console.error("cod confirm error", err);
    return NextResponse.json({ error: "Unable to confirm COD order" }, { status: 500 });
  }
}
