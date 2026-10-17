import { NextResponse } from "next/server";
import { loadAuthorizedCheckoutOrder } from "@/lib/checkout-order-access";
import { verifyCheckoutCapture } from "@/lib/verify-checkout-capture";
import { CaptureVerificationError } from "@/lib/payment-capture-validation";
import {
  finalizeRazorpayOrderPayment,
} from "@/lib/medusa-payment";

export const dynamic = "force-dynamic";

type ReconcileBody = {
  medusaOrderId?: string;
};

export async function POST(req: Request) {
  const timings: string[] = [];
  let phaseStarted = performance.now();
  const markPhase = (name: string) => {
    const now = performance.now();
    timings.push(`${name};dur=${(now - phaseStarted).toFixed(1)}`);
    phaseStarted = now;
  };
  try {
    const body = (await req.json().catch(() => ({}))) as ReconcileBody;
    const medusaOrderId = body.medusaOrderId?.trim();
    if (!medusaOrderId) {
      return NextResponse.json({ error: "medusaOrderId required" }, { status: 400 });
    }
    const access = await loadAuthorizedCheckoutOrder(req, medusaOrderId);
    markPhase("ownership");
    if (access.error) return access.error;
    const loaded = access.loaded;
    if (!loaded) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    const metadata = loaded.order.metadata || {};
    const razorpayPaymentId =
      typeof metadata.razorpay_payment_id === "string" ? metadata.razorpay_payment_id : "";
    const razorpayOrderId =
      typeof metadata.razorpay_order_id === "string" ? metadata.razorpay_order_id : undefined;
    const razorpaySignature =
      typeof metadata.razorpay_signature === "string" ? metadata.razorpay_signature : undefined;

    if (!razorpayPaymentId) {
      return NextResponse.json({ ok: false, error: "no_razorpay_payment_id" }, { status: 400 });
    }

    if (!razorpayOrderId) return NextResponse.json({ error: "no_razorpay_order_id" }, { status: 409 });
    const { amountMinor, currencyCode } = await verifyCheckoutCapture({
      medusaOrderId, paymentId: razorpayPaymentId, gatewayOrderId: razorpayOrderId,
    }, loaded);
    markPhase("gateway");

    const result = await finalizeRazorpayOrderPayment({
      orderId: medusaOrderId,
      amountMinor,
      currencyCode,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      reconciledAt: new Date().toISOString(),
    });
    markPhase("accounting");

    return NextResponse.json(result, { status: result.ok ? 200 : 503, headers: { "Server-Timing": timings.join(", ") } });
  } catch (err) {
    if (err instanceof CaptureVerificationError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("razorpay reconcile failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
