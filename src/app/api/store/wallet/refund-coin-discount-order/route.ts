import { NextRequest, NextResponse } from "next/server";
import { getOrderById } from "@/lib/medusa-admin";
import { refundCoinSpendForOrder } from "@/lib/wallet-coin-order";
import { internalApiHeaders } from "@/lib/store-customer-auth";
import { requireWalletMutationAuth } from "@/lib/wallet-mutation-auth";
import {
  assertOrderOwnedByCustomer,
  isOrderEligibleForCustomerCoinRefund,
  loadParsedOrder,
} from "@/lib/wallet-order-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { auth, errorResponse } = await requireWalletMutationAuth(req);
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const orderId = typeof body?.order_id === "string" ? body.order_id.trim() : "";
    const reasonRaw = typeof body?.reason === "string" ? body.reason.trim() : "";
    const reason = reasonRaw ? reasonRaw : "return";

    if (!orderId) {
      return NextResponse.json({ error: "order_id required" }, { status: 400 });
    }

    if (!auth.internal) {
      const ownership = await assertOrderOwnedByCustomer(orderId, auth.customerId);
      if ("errorResponse" in ownership) return ownership.errorResponse;

      if (!isOrderEligibleForCustomerCoinRefund(ownership.order)) {
        return NextResponse.json(
          { error: "Refund not allowed for this order state" },
          { status: 403 }
        );
      }
    }

    const ledgerRefund = await refundCoinSpendForOrder({ orderId, reason });
    if (ledgerRefund.refunded_amount) {
      return NextResponse.json(ledgerRefund);
    }

    // Legacy: orders that spent coins via promotion code before checkout refactor
    const orderRes = await getOrderById(orderId);
    if (!orderRes.ok || !orderRes.data) {
      return NextResponse.json(ledgerRefund);
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
      const parsed = await loadParsedOrder(orderId);
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      const refundRes = await fetch(`${baseUrl}/api/store/wallet/refund-coin-discount`, {
        method: "POST",
        headers: internalApiHeaders(),
        body: JSON.stringify({
          discount_code: discountCode,
          customer_id: parsed?.customerId || undefined,
        }),
      });
      const data = await refundRes.json().catch(() => ({}));
      return NextResponse.json({ success: true, refunded: data, legacy: true });
    }

    return NextResponse.json(ledgerRefund);
  } catch (error) {
    console.error("refund-coin-discount-order error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
