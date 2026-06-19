import { NextResponse } from "next/server";
import { getSiteOrigin, verifyCheckoutPaymentSignature } from "@/lib/razorpay";
import {
  buildCheckoutReturnUrl,
  getCheckoutFailedPath,
  getCheckoutSuccessPath,
} from "@/lib/checkout-redirects";

export const dynamic = "force-dynamic";

const SUCCESS_PATH = getCheckoutSuccessPath();
const FAILED_PATH = getCheckoutFailedPath();

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

  const origin = getSiteOrigin(url.origin, url.origin);

  if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
    return NextResponse.redirect(
      buildCheckoutReturnUrl(FAILED_PATH, { orderId: medusaOrderId }, origin)
    );
  }

  const verified = verifyCheckoutPaymentSignature({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });

  if (!verified) {
    return NextResponse.redirect(
      buildCheckoutReturnUrl(
        FAILED_PATH,
        { orderId: medusaOrderId, error: "invalid_signature" },
        origin
      )
    );
  }

  if (medusaOrderId) {
    try {
      await fetch(`${origin}/api/checkout/razorpay/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          medusaOrderId,
          razorpay_payment_id,
          razorpay_order_id,
          razorpay_signature,
        }),
      });
    } catch (err) {
      console.error("razorpay callback confirm failed", err);
    }
  }

  const successTarget = buildCheckoutReturnUrl(
    SUCCESS_PATH,
    { orderId: medusaOrderId, confirming: "1" },
    origin
  );

  return NextResponse.redirect(successTarget, 303);
}
