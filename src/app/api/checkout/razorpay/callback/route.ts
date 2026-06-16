import { NextResponse } from "next/server";
import { getSiteOrigin, verifyCheckoutPaymentSignature } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

const SUCCESS_URL = process.env.NEXT_PUBLIC_PAYMENT_SUCCESS_URL || "/order/success";
const FAILED_URL = process.env.NEXT_PUBLIC_PAYMENT_FAILED_URL || "/order/failed";

async function parseCallbackBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(json).map(([k, v]) => [k, typeof v === "string" ? v : String(v ?? "")])
    );
  }

  const form = await req.formData();
  const out: Record<string, string> = {};
  form.forEach((value, key) => {
    out[key] = String(value);
  });
  return out;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const medusaOrderId = url.searchParams.get("orderId")?.trim() || "";

  const body = await parseCallbackBody(req);
  const razorpay_payment_id = body.razorpay_payment_id || "";
  const razorpay_order_id = body.razorpay_order_id || "";
  const razorpay_signature = body.razorpay_signature || "";

  const origin = getSiteOrigin(url.origin);

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return NextResponse.redirect(`${origin}${FAILED_URL}?orderId=${encodeURIComponent(medusaOrderId)}`);
  }

  const verified = verifyCheckoutPaymentSignature({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });

  if (!verified) {
    return NextResponse.redirect(
      `${origin}${FAILED_URL}?orderId=${encodeURIComponent(medusaOrderId)}&error=invalid_signature`
    );
  }

  if (medusaOrderId) {
    void fetch(`${origin}/api/checkout/razorpay/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        medusaOrderId,
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature,
      }),
    }).catch((err) => console.error("razorpay callback confirm failed", err));
  }

  const successTarget = `${origin}${SUCCESS_URL}?orderId=${encodeURIComponent(
    medusaOrderId
  )}&confirming=1`;

  return NextResponse.redirect(successTarget, 303);
}
