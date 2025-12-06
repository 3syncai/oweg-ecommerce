import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  updateOrderMetadata,
  setOrderPaidTotal,
  setOrderPaymentStatus,
  registerOrderTransaction,
} from "@/lib/medusa-admin";

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

    const metadata = {
      razorpay_payment_status: "captured",
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      razorpay_amount_minor: amountMinor,
      medusa_total_minor: amountMinor,
      medusa_amount_scale: "checkout_confirm",
      amount_reconcile_matched: true,
    };

    // Persist metadata and payment state
    await updateOrderMetadata(medusaOrderId, metadata);
    if (typeof amountMinor === "number") {
      await setOrderPaidTotal(medusaOrderId, amountMinor);
    }
    await setOrderPaymentStatus(medusaOrderId, "captured");

    // Best-effort transaction record
    if (typeof amountMinor === "number") {
      await registerOrderTransaction(medusaOrderId, {
        amount: amountMinor,
        currency_code: (currency || "INR").toLowerCase(),
        reference: razorpay_payment_id,
        provider: "razorpay",
        metadata: {
          razorpay_payment_id,
          razorpay_order_id,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("razorpay confirm failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
