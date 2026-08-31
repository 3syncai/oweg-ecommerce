import { NextResponse, after } from "next/server";
import crypto from "crypto";
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
import { logPendingCoinsForOrder } from "@/lib/customer-affiliate-coins";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
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

function verifyCheckoutSignature(payload: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const generated = crypto
    .createHmac("sha256", secret)
    .update(`${payload.razorpay_order_id}|${payload.razorpay_payment_id}`)
    .digest("hex");
  return generated === payload.razorpay_signature;
}

async function runPostPaidSideEffects(finalOrderId: string, amountMinor?: number) {
  // AFFILIATE COMMISSION: Call the commission webhook for hierarchy support
  if (typeof amountMinor === "number") {
    try {
      console.log("razorpay confirm: Triggering commission webhook for hierarchy...");

      const pool = getPool();
      if (!pool) throw new Error("Database not configured");

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
        console.log(`razorpay confirm: Found affiliate code ${affiliateCode}, calling webhook...`);

        const itemsResult = await pool.query(
          `SELECT 
             oi.id, 
             pv.product_id,
             oi.quantity,
             oli.unit_price,
             p.title as product_name
           FROM order_item oi
           JOIN order_line_item oli ON oi.item_id = oli.id
           LEFT JOIN product_variant pv ON oli.variant_id = pv.id
           LEFT JOIN product p ON pv.product_id = p.id
           WHERE oi.order_id = $1`,
          [finalOrderId]
        );

        const webhookUrl = process.env.AFFILIATE_WEBHOOK_URL;

        if (!webhookUrl) {
          console.error("razorpay confirm: ⚠️ AFFILIATE_WEBHOOK_URL not set, skipping commission webhook");
        } else {
          await Promise.all(
            itemsResult.rows.map(async (item) => {
              const unitPrice = parseFloat(item.unit_price || 0);
              const itemAmount = unitPrice * (item.quantity || 1);

              const payload = {
                order_id: finalOrderId,
                affiliate_code: affiliateCode,
                product_id: item.product_id,
                product_name: item.product_name,
                quantity: item.quantity,
                item_price: unitPrice / 100,
                order_amount: itemAmount,
                status: "PENDING",
                customer_id: customer.id,
                customer_name: customer.name,
                customer_email: customer.email,
              };

              console.log(`razorpay confirm: Sending webhook for ${item.product_name}...`);

              try {
                const response = await fetchWithTimeout(
                  webhookUrl,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  },
                  5000
                );

                if (response.ok) {
                  const result = await response.json();
                  console.log(`✅ Webhook success for ${item.product_name}:`, result);
                } else {
                  const error = await response.text();
                  console.error(`❌ Webhook failed for ${item.product_name}:`, error);
                }
              } catch (fetchErr) {
                console.error(`❌ Webhook fetch error for ${item.product_name}:`, fetchErr);
              }
            })
          );
        }
      } else {
        console.log("razorpay confirm: No affiliate code, skipping commission");
      }
    } catch (affiliateErr) {
      console.error("razorpay confirm: ⚠️ Affiliate webhook failed:", affiliateErr);
    }
  }

  try {
    const result = await logPendingCoinsForOrder(finalOrderId);
    console.log("[customer-affiliate-coins] razorpay confirm:", result);
  } catch (err) {
    console.error("[customer-affiliate-coins] razorpay confirm failed:", err);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ConfirmBody;
    const { medusaOrderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = body;
    const amountMinor = typeof body.amount_minor === "number" ? body.amount_minor : undefined;
    const currency = typeof body.currency === "string" ? body.currency : undefined;
    const currencyCode = (currency || "INR").toLowerCase();

    if (!medusaOrderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return badRequest("Missing payment details");
    }

    const verified = verifyCheckoutSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
    if (!verified) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }

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
        // HMAC already verified. Prefer local tombstone/snapshot rebuild; skip RZP GET
        // so QA fake pay_* ids still recover (remote lookup is for unsigned recover API).
        skipRemotePaymentLookup: true,
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
      razorpay_payment_status: "captured",
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      razorpay_amount_minor: amountMinor,
      razorpay_paid_total: amountMinor,
      razorpay_payment_status_confirmed: "captured",
      razorpay_captured_at: new Date().toISOString(),
      medusa_total_minor: amountMinor,
      medusa_amount_scale: "checkout_confirm",
      amount_reconcile_matched: true,
    };

    // Persist metadata
    const metaRes = await updateOrderMetadata(finalOrderId, metadata);
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
              ...orderMetadata,
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
              ...orderMetadata,
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
            ...orderMetadata,
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
    after(() => runPostPaidSideEffects(finalOrderId, amountMinor));

    return NextResponse.json({
      ok: true,
      paymentCreated,
      finalizeOk,
      medusaOrderId: finalOrderId,
      orderId: finalOrderId,
      adminReconcileRequired: !finalizeOk || !paymentCreated,
    });
  } catch (err) {
    console.error("razorpay confirm failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
