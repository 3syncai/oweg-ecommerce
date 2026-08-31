import { NextResponse } from "next/server";
import { verifyCheckoutPaymentSignature } from "@/lib/razorpay";
import { recoverRazorpayCapture } from "@/lib/razorpay-capture-recover";

export const dynamic = "force-dynamic";

type Body = {
  medusaOrderId?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
  amount_minor?: number;
  currency?: string;
};

/**
 * Recover a paid orphan: Razorpay captured but Medusa draft was tombstoned/missing.
 * Requires valid checkout HMAC signature (same as confirm).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const razorpay_payment_id = body.razorpay_payment_id?.trim();
    const razorpay_order_id = body.razorpay_order_id?.trim();
    const razorpay_signature = body.razorpay_signature?.trim();
    const medusaOrderId = body.medusaOrderId?.trim();

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return NextResponse.json({ error: "missing_payment_details" }, { status: 400 });
    }

    const verified = verifyCheckoutPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
    if (!verified) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
    }

    const result = await recoverRazorpayCapture({
      medusaOrderId,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      amountMinor: typeof body.amount_minor === "number" ? body.amount_minor : undefined,
      currencyCode: body.currency,
    });

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        orderId: result.orderId,
        recovered: result.recovered,
        alreadyPlaced: result.alreadyPlaced,
        paymentCreated: result.paymentCreated,
      });
    }

    if (result.error === "not_captured") {
      return NextResponse.json(result, { status: 409 });
    }
    if (result.error === "orphan_capture") {
      return NextResponse.json(result, { status: 502 });
    }
    if (result.error === "invalid_input") {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result, { status: 500 });
  } catch (err) {
    console.error("razorpay recover failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
