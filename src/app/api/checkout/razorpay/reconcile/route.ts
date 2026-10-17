import { NextResponse } from "next/server";
import { checkoutOrderAccessError } from "@/lib/checkout-order-access";
import { getOrderById, updateOrderMetadata } from "@/lib/medusa-admin";
import { verifyCheckoutCapture } from "@/lib/verify-checkout-capture";
import { CaptureVerificationError } from "@/lib/payment-capture-validation";
import {
  finalizeRazorpayOrderPayment,
} from "@/lib/medusa-payment";

export const dynamic = "force-dynamic";

type ReconcileBody = {
  medusaOrderId?: string;
};

function extractOrder(data: unknown): { id?: string; metadata?: Record<string, unknown> } | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  if (root.order && typeof root.order === "object") return root.order as { id?: string; metadata?: Record<string, unknown> };
  return root as { id?: string; metadata?: Record<string, unknown> };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as ReconcileBody;
    const medusaOrderId = body.medusaOrderId?.trim();
    if (!medusaOrderId) {
      return NextResponse.json({ error: "medusaOrderId required" }, { status: 400 });
    }
    const accessError = await checkoutOrderAccessError(req, medusaOrderId);
    if (accessError) return accessError;

    const orderRes = await getOrderById(medusaOrderId);
    if (!orderRes.ok || !orderRes.data) {
      return NextResponse.json({ error: "order not found" }, { status: 404 });
    }

    const order = extractOrder(orderRes.data);
    const metadata = (order?.metadata || {}) as Record<string, unknown>;
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
    });

    const result = await finalizeRazorpayOrderPayment({
      orderId: medusaOrderId,
      amountMinor,
      currencyCode,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    });

    await updateOrderMetadata(medusaOrderId, {
      payment_method: "razorpay",
      razorpay_capture_status: result.ok ? "captured" : "failed",
      razorpay_reconciled_at: new Date().toISOString(),
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (err) {
    if (err instanceof CaptureVerificationError) return NextResponse.json({ error: err.code }, { status: err.status });
    console.error("razorpay reconcile failed", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
