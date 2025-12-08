import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  updateOrderMetadata,
  registerOrderTransaction,
  captureOrderPayment,
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
    }

    return NextResponse.json({ ok: true, paymentCreated });
  } catch (err) {
    console.error("razorpay confirm failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
