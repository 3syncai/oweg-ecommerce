import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  updateOrderMetadata,
  registerOrderTransaction,
  captureOrderPayment,
<<<<<<< HEAD
  getOrderById,
  capturePayment,
  registerOrderPayment,
  registerOrderPaymentV2,
  setOrderPaidTotal,
  setOrderPaymentStatus,
=======
>>>>>>> origin/razorpay
} from "@/lib/medusa-admin";
import { createMedusaPayment } from "@/lib/medusa-payment";

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

<<<<<<< HEAD
    // Persist metadata and payment state
    const currencyCode = (currency || "INR").toLowerCase();
    const paidMinor = typeof amountMinor === "number" ? amountMinor : undefined;

    // Try to discover an existing payment id for fallbacks
    let paymentId: string | undefined;
    try {
      const orderRes = await getOrderById(medusaOrderId);
      if (orderRes.ok && orderRes.data) {
        const root = orderRes.data as Record<string, unknown>;
        const order = (root.order as Record<string, unknown>) || root;
        const payments: Array<Record<string, unknown>> | undefined =
          (order.payments as Array<Record<string, unknown>>) ||
          ((order as Record<string, unknown>).payments as Array<Record<string, unknown>>);
        if (payments?.length && typeof payments[0]?.id === "string") {
          paymentId = payments[0].id as string;
        }
      }
    } catch (err) {
      console.error("razorpay confirm: failed to fetch order for payment lookup", err);
    }

    const metaRes = await updateOrderMetadata(medusaOrderId, metadata);
    if (!metaRes.ok) {
      console.error("razorpay confirm: metadata update failed", { status: metaRes.status, data: metaRes.data });
    }

    // Capture / register payment using Medusa payment capture endpoints
    let capturedOk = false;
    if (paidMinor !== undefined) {
      let captureRes = await captureOrderPayment(medusaOrderId, {
        amount: paidMinor,
        currency_code: currencyCode,
        payment_id: razorpay_payment_id,
        metadata: {
          razorpay_payment_id,
          razorpay_order_id,
          razorpay_signature,
        },
      });
      capturedOk = Boolean(captureRes?.ok);

      // Fallback 1: capture the payment directly (Medusa v1 style)
      if (!capturedOk && paymentId) {
        const payCapture = await capturePayment(paymentId, { amount: paidMinor });
        capturedOk = Boolean(payCapture?.ok);
        if (!capturedOk && payCapture && payCapture.status !== 404) {
          console.error("razorpay confirm: payment capture failed", {
            status: payCapture.status,
            data: payCapture.data,
          });
        }
      }

      // Fallback 2a: register a payment against the order (Medusa v2 register-payment)
      if (!capturedOk) {
        const regV2 = await registerOrderPaymentV2(medusaOrderId, {
          amount: paidMinor,
          currency_code: currencyCode,
          payment_id: razorpay_payment_id,
          metadata: {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
          },
        });
        capturedOk = Boolean(regV2?.ok);
        if (!capturedOk && regV2 && regV2.status !== 404) {
          console.error("razorpay confirm: register payment v2 failed", { status: regV2.status, data: regV2.data });
        }
      }

      // Fallback 2b: register a payment against the order (Medusa v1 compat)
      if (!capturedOk) {
        const regRes = await registerOrderPayment(medusaOrderId, {
          amount: paidMinor,
          currency_code: currencyCode,
          payment_id: razorpay_payment_id,
          metadata: {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
          },
        });
        capturedOk = Boolean(regRes?.ok);
        if (!capturedOk && regRes && regRes.status !== 404) {
          console.error("razorpay confirm: register payment failed", { status: regRes.status, data: regRes.data });
        }
      }

      if (!capturedOk && captureRes && captureRes.status !== 404) {
        console.error("razorpay confirm: capture payment failed", { status: captureRes.status, data: captureRes.data });
      }
    }

    // Best-effort transaction record; skip logging 404s
    if (paidMinor !== undefined && capturedOk) {
      const txRes = await registerOrderTransaction(medusaOrderId, {
        amount: paidMinor,
=======
    // Persist metadata
    const metaRes = await updateOrderMetadata(medusaOrderId, metadata);
    if (!metaRes.ok) {
      console.error("razorpay confirm: metadata update failed", { status: metaRes.status, data: metaRes.data });
    }

    // Create payment record in Medusa payment tables (payment_collection, payment_session, payment)
    let paymentCreated = false;
    if (amountMinor !== undefined) {
      console.log("razorpay confirm: creating Medusa payment record...");
      const paymentResult = await createMedusaPayment({
        order_id: medusaOrderId,
        amount: amountMinor,
        currency_code: currencyCode,
        provider_id: "razorpay",
        data: {
          status: "captured",
          captured: true,
          amount_in_paise: amountMinor,
          razorpay_payment_id,
          razorpay_order_id,
          razorpay_signature,
          captured_at: new Date().toISOString(),
        },
      });

      if (paymentResult.success) {
        paymentCreated = true;
        console.log("razorpay confirm: ✅ Medusa payment record created");
      } else {
        console.error("razorpay confirm: ❌ Failed to create Medusa payment:", paymentResult.error);
      }
    }

    // Also try API-based capture methods (fallback)
    if (!paymentCreated && amountMinor !== undefined) {
      const captureRes = await captureOrderPayment(medusaOrderId, {
        amount: amountMinor,
        currency_code: currencyCode,
        payment_id: razorpay_payment_id,
        metadata: {
          razorpay_payment_id,
          razorpay_order_id,
          provider: "razorpay",
        },
      });
      if (captureRes.ok) {
        paymentCreated = true;
        console.log("razorpay confirm: payment captured via API");
      }
    }

    // Best-effort transaction record
    if (typeof amountMinor === "number") {
      const txRes = await registerOrderTransaction(medusaOrderId, {
        amount: amountMinor,
>>>>>>> origin/razorpay
        currency_code: currencyCode,
        reference: razorpay_payment_id,
        provider: "razorpay",
        metadata: {
          razorpay_payment_id,
          razorpay_order_id,
        },
      });
      if (!txRes.ok && txRes.status !== 404) {
        console.error("razorpay confirm: register transaction failed", { status: txRes.status, data: txRes.data });
      }
<<<<<<< HEAD
    }

    // Ensure Medusa order reflects the paid amount even if transaction endpoint is absent
    if (paidMinor !== undefined) {
      try {
        const paidRes = await setOrderPaidTotal(medusaOrderId, paidMinor);
        if (!paidRes.ok) {
          console.error("razorpay confirm: set paid total failed", { status: paidRes.status, data: paidRes.data });
        }
        const statusRes = await setOrderPaymentStatus(medusaOrderId, "captured");
        if (!statusRes.ok) {
          console.error("razorpay confirm: set payment status failed", { status: statusRes.status, data: statusRes.data });
        }
      } catch (err) {
        console.error("razorpay confirm: failed to sync paid total/payment status", err);
      }
=======
>>>>>>> origin/razorpay
    }

    return NextResponse.json({ ok: true, paymentCreated });
  } catch (err) {
    console.error("razorpay confirm failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
