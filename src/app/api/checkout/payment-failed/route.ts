import { NextResponse } from "next/server";
import { markCheckoutPaymentFailed } from "@/lib/checkout-order";
import { refundCoinSpendForOrder } from "@/lib/wallet-coin-order";

export const dynamic = "force-dynamic";

type Body = {
  medusaOrderId?: string;
  order_id?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const orderId = body.medusaOrderId?.trim() || body.order_id?.trim();
    if (!orderId) {
      return NextResponse.json({ error: "medusaOrderId is required" }, { status: 400 });
    }

    const result = await markCheckoutPaymentFailed(orderId);

    // Do not refund coins if we recovered a real capture.
    if (!result.recovered) {
      try {
        await refundCoinSpendForOrder({ orderId, reason: "failed" });
      } catch {
        // Best-effort coin refund; webhook also handles this.
      }
    }

    return NextResponse.json({
      ok: true,
      tombstoned: result.tombstoned || false,
      recovered: result.recovered || false,
      orderId: result.orderId || orderId,
      alreadyGone: result.alreadyGone || false,
    });
  } catch (err) {
    console.error("payment-failed cleanup error", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
