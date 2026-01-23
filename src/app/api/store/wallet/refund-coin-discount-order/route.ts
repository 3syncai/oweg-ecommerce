import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/medusa-admin";
import { creditAdjustment } from "@/lib/wallet-ledger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    const reasonRaw = typeof body?.reason === "string" ? body.reason.trim() : "";
    const reason = reasonRaw ? reasonRaw : "return";

    if (!orderId) {
      return NextResponse.json({ error: "order_id required" }, { status: 400 });
    }

    const orderRes = await getOrderById(orderId);
    if (!orderRes.ok || !orderRes.data) {
      return NextResponse.json({ error: "order not found" }, { status: 404 });
    }

    const orderPayload = orderRes.data as Record<string, unknown>;
    const order =
      (orderPayload && typeof orderPayload === "object" && "order" in orderPayload
        ? (orderPayload as Record<string, unknown>).order
        : orderPayload) as Record<string, unknown> | null;

    const metadata =
      order && typeof order === "object"
        ? ((order as Record<string, unknown>).metadata as Record<string, unknown> | undefined)
        : undefined;

    const discountCode =
      (metadata?.coin_discount_code as string | undefined) ||
      (metadata?.coin_discount as string | undefined) ||
      (metadata?.coin_discount_id as string | undefined);

    if (discountCode) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const refundRes = await fetch(`${baseUrl}/api/store/wallet/refund-coin-discount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discount_code: discountCode }),
      });
      const data = await refundRes.json().catch(() => ({}));
      return NextResponse.json({ success: true, refunded: data });
    }

    const coinsDiscounted =
      typeof metadata?.coins_discountend === "number"
        ? metadata.coins_discountend
        : typeof metadata?.coin_discount_rupees === "number"
          ? metadata.coin_discount_rupees
          : typeof metadata?.coin_discount_minor === "number"
            ? metadata.coin_discount_minor / 100
            : 0;

    const customerId =
      (order as any)?.customer_id ||
      (order as any)?.customer?.id ||
      undefined;

    if (customerId && coinsDiscounted > 0) {
      const amountMinor = Math.round(coinsDiscounted * 100);
      await creditAdjustment({
        customerId: String(customerId),
        referenceId: `refund-${reason}:${orderId}`,
        idempotencyKey: `refund-${reason}:${orderId}`,
        amountMinor,
        reason: `Refund coins for ${reason} ${orderId}`,
        metadata: { order_id: orderId, coins_discountend: coinsDiscounted, reason },
      });
      return NextResponse.json({
        success: true,
        refunded_amount: amountMinor / 100,
        message: "Coins refunded via order metadata",
      });
    }

    return NextResponse.json({ success: true, message: "No coins to refund" });
  } catch (error) {
    console.error("refund-coin-discount-order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
