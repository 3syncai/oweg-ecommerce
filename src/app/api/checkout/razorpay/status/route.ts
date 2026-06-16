import { NextResponse } from "next/server";
import { fetchRazorpayPayment } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get("paymentId")?.trim();
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  }

  try {
    const payment = await fetchRazorpayPayment(paymentId);
    return NextResponse.json({
      id: payment.id,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      method: payment.method,
      order_id: payment.order_id,
      error_code: payment.error_code,
      error_description: payment.error_description,
    });
  } catch (err) {
    console.error("razorpay status fetch failed", err);
    const message = err instanceof Error ? err.message : "Unable to fetch payment status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
