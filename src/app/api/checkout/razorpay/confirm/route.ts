import { NextResponse, after } from "next/server";
import { verifyCheckoutPaymentSignature } from "@/lib/razorpay";
import { verifyCheckoutCapture } from "@/lib/verify-checkout-capture";
import { CaptureVerificationError } from "@/lib/payment-capture-validation";
import {
  updateOrderMetadata,
} from "@/lib/medusa-admin";
import {
  ensurePlacedCheckoutOrder,
  runPostConvertCheckoutSideEffects,
} from "@/lib/checkout-order";
import {
  ensurePlacedOrderFulfillmentReady,
  finalizeRazorpayOrderPayment,
  resolveOrderPayableAmountMinor,
} from "@/lib/medusa-payment";
import { finalizeCoinSpendForOrder } from "@/lib/wallet-coin-order";
import { OWEG10_CODE } from "@/lib/oweg10-shared";
import { consumeOweg10Reservation, syncOweg10ConsumedCustomerMetadata } from "@/lib/oweg10";
import { Pool } from 'pg';

// Shared pool instance at module level to avoid creating multiple connections per request
let sharedPool: Pool | null = null;

function getPool(): Pool | null {
  if (!sharedPool && process.env.DATABASE_URL) {
    sharedPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return sharedPool;
}

type ConfirmBody = {
  medusaOrderId?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
  amount_minor?: number; // paise
  currency?: string;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function stringifyErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ConfirmBody;
    const { medusaOrderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;
    if ([medusaOrderId, razorpay_payment_id, razorpay_order_id, razorpay_signature].some(value => typeof value !== "string" || !value.trim()) ||
        (body.amount_minor !== undefined && (!Number.isSafeInteger(body.amount_minor) || body.amount_minor <= 0)) ||
        (body.currency !== undefined && typeof body.currency !== "string")) return badRequest("Invalid payment details");

    if (!medusaOrderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return badRequest("Missing payment details");
    }

    const verified = verifyCheckoutPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
    if (!verified) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }

    const { amountMinor, currencyCode } = await verifyCheckoutCapture({
      medusaOrderId, paymentId: razorpay_payment_id, gatewayOrderId: razorpay_order_id,
      claimedAmountMinor: body.amount_minor, claimedCurrency: body.currency,
    });

    let placed = await ensurePlacedCheckoutOrder(medusaOrderId);
    if (!placed) {
      // Draft may be tombstoned/missing after dismiss race — recover from Razorpay capture.
      const { recoverRazorpayCapture } = await import("@/lib/razorpay-capture-recover");
      const recovered = await recoverRazorpayCapture({
        medusaOrderId,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        razorpaySignature: razorpay_signature,
        amountMinor,
        currencyCode,
      });
      if (recovered.ok) {
        return NextResponse.json({
          ok: true,
          recovered: true,
          paymentCreated: recovered.paymentCreated,
          medusaOrderId: recovered.orderId,
          orderId: recovered.orderId,
        });
      }
      if (recovered.error === "orphan_capture") {
        return NextResponse.json(recovered, { status: 502 });
      }
      if (recovered.error === "gateway_unavailable") {
        return NextResponse.json(recovered, { status: 503 });
      }
      return NextResponse.json(
        { error: "order_not_found", recovery: recovered },
        { status: 404 }
      );
    }

    const finalOrderId = placed.orderId;
    const orderMetadata = (placed.order.metadata || {}) as Record<string, unknown>;

    // Always sync discounts into order_summary (idempotent). Previously this only ran
    // when converted===true, so webhook-first / already-placed orders kept Outstanding.
    try {
      await runPostConvertCheckoutSideEffects(finalOrderId, orderMetadata);
    } catch (sideErr) {
      console.error("razorpay confirm: discount/summary sync failed", sideErr);
    }

    // Store all payment data in metadata
    const metadata = {
      razorpay_payment_status: "pending_recording",
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      razorpay_amount_minor: amountMinor,
      razorpay_paid_total: amountMinor,
      razorpay_payment_status_confirmed: "pending_recording",
      razorpay_verified_at: new Date().toISOString(),
      medusa_total_minor: amountMinor,
      medusa_amount_scale: "checkout_confirm",
      amount_reconcile_matched: true,
    };

    // Persist metadata
    const metaRes = orderMetadata.razorpay_payment_status === "captured"
      ? { ok: true, status: 200, data: null }
      : await updateOrderMetadata(finalOrderId, metadata);
    if (!metaRes.ok) {
      console.error("razorpay confirm: metadata update failed", { status: metaRes.status, data: metaRes.data });
    }

    try {
      const reservationToken =
        typeof orderMetadata.oweg10_reservation_token === "string"
          ? orderMetadata.oweg10_reservation_token
          : undefined;
      const customerId =
        typeof orderMetadata.oweg10_customer_id === "string"
          ? orderMetadata.oweg10_customer_id
          : typeof placed.order.customer_id === "string"
            ? placed.order.customer_id
            : undefined;

      if (reservationToken && customerId) {
        try {
          const consumeResult = await consumeOweg10Reservation({
            customerId,
            reservationToken,
            orderId: finalOrderId,
            metadata: {
              payment_method: "razorpay",
              source: "razorpay-confirm",
              razorpay_payment_id,
            },
          });

          if (!consumeResult.ok) {
            await updateOrderMetadata(finalOrderId, {
              oweg10_pending: true,
              oweg10_reconcile_required: true,
              oweg10_reconcile_reason: "consume_rejected",
              oweg10_reconcile_details: {
                consumeResult,
                razorpay_payment_id,
              },
            });
            console.warn("razorpay confirm: OWEG10 consume rejected; reconciliation required", {
              finalOrderId,
              customerId,
              consumeResult,
            });
          } else {
            await syncOweg10ConsumedCustomerMetadata(customerId);
            await updateOrderMetadata(finalOrderId, {
              oweg10_pending: false,
              oweg10_consumed: true,
              oweg10_consumed_at: new Date().toISOString(),
              oweg10_reconcile_required: false,
              oweg10_reconcile_reason: undefined,
              oweg10_reconcile_details: undefined,
              oweg10_code:
                typeof orderMetadata.oweg10_code === "string" ? orderMetadata.oweg10_code : OWEG10_CODE,
            });
          }
        } catch (consumeError) {
          const errorDetails = stringifyErrorDetails(consumeError);
          await updateOrderMetadata(finalOrderId, {
            oweg10_pending: true,
            oweg10_reconcile_required: true,
            oweg10_reconcile_reason: "consume_error",
            oweg10_reconcile_details: {
              error: errorDetails,
              razorpay_payment_id,
            },
          });
          console.warn("razorpay confirm: OWEG10 consume failed; reconciliation required", {
            finalOrderId,
            customerId,
            error: errorDetails,
          });
        }
      }
    } catch (error) {
      console.warn("razorpay confirm: OWEG10 consume sync failed", {
        finalOrderId,
        error: stringifyErrorDetails(error),
      });
    }

    // FORCE RESERVATIONS AND SHIPPING METHOD
    console.log("razorpay confirm: Ensuring order readiness...");
    await ensurePlacedOrderFulfillmentReady(finalOrderId);

    // Create payment records + sync Medusa admin "Captured" status
    let paymentCreated = false;
    let finalizeOk = false;
    const resolvedAmountMinor =
      typeof amountMinor === "number" && amountMinor > 0
        ? amountMinor
        : await resolveOrderPayableAmountMinor(finalOrderId);

    if (resolvedAmountMinor && resolvedAmountMinor > 0) {
      const finalizeResult = await finalizeRazorpayOrderPayment({
        orderId: finalOrderId,
        amountMinor: resolvedAmountMinor,
        currencyCode,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        razorpaySignature: razorpay_signature,
      });
      paymentCreated =
        Boolean(finalizeResult.paymentCreated) || Boolean(finalizeResult.skipped);
      finalizeOk = Boolean(finalizeResult.ok);

      if (!finalizeResult.ok || !paymentCreated) {
        console.error("razorpay confirm: finalize payment incomplete", finalizeResult);
      }
    } else {
      console.error("razorpay confirm: missing payable amount for order", finalOrderId);
    }

    await updateOrderMetadata(finalOrderId, {
      payment_method: "razorpay",
      razorpay_capture_status: finalizeOk && paymentCreated ? "captured" : "failed",
      razorpay_admin_reconcile_required: !finalizeOk || !paymentCreated,
      cod_status: null,
      cod_post_process_done: null,
    });

    // Background repair if payment module rows failed but Razorpay already captured.
    if (!finalizeOk || !paymentCreated) {
      const repairAmount = resolvedAmountMinor;
      const repairPaymentId = razorpay_payment_id;
      const repairOrderId = razorpay_order_id;
      const repairSignature = razorpay_signature;
      const repairCurrency = currencyCode;
      after(async () => {
        try {
          let amount = repairAmount;
          if (!amount || amount <= 0) {
            amount = await resolveOrderPayableAmountMinor(finalOrderId);
          }
          if (!amount || amount <= 0) {
            console.warn("razorpay confirm: background reconcile skipped; no amount", finalOrderId);
            return;
          }
          const retry = await finalizeRazorpayOrderPayment({
            orderId: finalOrderId,
            amountMinor: amount,
            currencyCode: repairCurrency,
            razorpayPaymentId: repairPaymentId,
            razorpayOrderId: repairOrderId,
            razorpaySignature: repairSignature,
          });
          await updateOrderMetadata(finalOrderId, {
            razorpay_capture_status: retry.ok ? "captured" : "failed",
            razorpay_admin_reconcile_required: !retry.ok,
            razorpay_reconciled_at: new Date().toISOString(),
            razorpay_reconcile_source: "confirm_after",
          });
          console.info("razorpay confirm: background reconcile result", {
            finalOrderId,
            ok: retry.ok,
            paymentCreated: retry.paymentCreated,
          });
        } catch (err) {
          console.error("razorpay confirm: background reconcile failed", err);
        }
      });
    }

    if (!finalizeOk || !paymentCreated) {
      return NextResponse.json({ ok: false, error: "payment_recording_pending", paymentReceived: true,
        orderId: finalOrderId, adminReconcileRequired: true }, { status: 503 });
    }

    // Spend wallet coins after successful payment (discount already on order from draft-order).
    try {
      const pool = getPool();
      if (!pool) throw new Error("Database not configured");

      const metaResult = await pool.query(
        `SELECT metadata FROM "order" WHERE id = $1`,
        [finalOrderId]
      );
      const dbMetadata = metaResult.rows[0]?.metadata || {};
      const coinMinor =
        typeof dbMetadata?.coin_discount_minor === "number"
          ? dbMetadata.coin_discount_minor
          : typeof dbMetadata?.coin_discount_rupees === "number"
            ? Math.round(dbMetadata.coin_discount_rupees * 100)
            : 0;

      if (coinMinor > 0) {
        const customerId =
          typeof dbMetadata?.customer_id === "string"
            ? dbMetadata.customer_id
            : (
                await pool.query(`SELECT customer_id FROM "order" WHERE id = $1`, [finalOrderId])
              ).rows[0]?.customer_id;

        if (customerId) {
          await finalizeCoinSpendForOrder({
            customerId: String(customerId),
            orderId: finalOrderId,
            amountMinor: coinMinor,
          });
        }
      }
    } catch (coinError) {
      console.error("Coin spend error:", coinError);
    }

    // Non-blocking: affiliate webhooks + customer-affiliate coins after response
    // Post-payment effects are committed to payment_work with the capture.

    return NextResponse.json({
      ok: true,
      paymentCreated,
      finalizeOk,
      medusaOrderId: finalOrderId,
      orderId: finalOrderId,
      adminReconcileRequired: !finalizeOk || !paymentCreated,
    });
  } catch (err) {
    if (err instanceof CaptureVerificationError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("razorpay confirm failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
