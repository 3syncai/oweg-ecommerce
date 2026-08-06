import { NextRequest, NextResponse } from "next/server";
import { adminFetch } from "@/lib/medusa-admin";
import { medusaStoreFetch } from "@/lib/medusa-auth";
import { cancelOrReverseCoinsForOrder } from "@/lib/customer-affiliate-coins";

type RefundPayoutBody =
  | { method: "upi"; upi_id: string }
  | {
      method: "bank";
      account_name: string;
      account_number: string;
      ifsc_code: string;
      bank_name?: string;
    };

function sanitizeRefundPayout(raw: unknown): RefundPayoutBody | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const payout = raw as Record<string, unknown>;
  const method = typeof payout.method === "string" ? payout.method : "";

  if (method === "upi") {
    const upi_id = typeof payout.upi_id === "string" ? payout.upi_id.trim() : "";
    if (!upi_id) return undefined;
    return { method: "upi", upi_id };
  }

  if (method === "bank") {
    const account_name =
      typeof payout.account_name === "string" ? payout.account_name.trim() : "";
    const account_number =
      typeof payout.account_number === "string" ? payout.account_number.trim() : "";
    const ifsc_code =
      typeof payout.ifsc_code === "string" ? payout.ifsc_code.trim() : "";
    const bank_name =
      typeof payout.bank_name === "string" ? payout.bank_name.trim() : undefined;
    if (!account_name || !account_number || !ifsc_code) return undefined;
    return {
      method: "bank",
      account_name,
      account_number,
      ifsc_code,
      ...(bank_name ? { bank_name } : {}),
    };
  }

  return undefined;
}

export async function POST(req: NextRequest, ctx: { params: { id: string } | Promise<{ id: string }> }) {
  const awaitedParams = await ctx.params;
  const orderId = awaitedParams?.id;
  if (!orderId) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  const forwardedCookie = req.headers.get("cookie") || undefined;
  if (!forwardedCookie) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let reason = "";
  let refund_payout: RefundPayoutBody | undefined;
  try {
    const body = await req.json();
    reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 180) : "";
    refund_payout = sanitizeRefundPayout(body?.refund_payout);
  } catch {
    reason = "";
  }
  if (reason.length < 3) {
    return NextResponse.json({ error: "Cancellation reason is required." }, { status: 400 });
  }

  const fireCustomerAffiliate = async () => {
    try {
      const result = await cancelOrReverseCoinsForOrder(orderId, { event: "order.cancelled" });
      console.log("[customer-affiliate-coins] order cancel:", result);
    } catch (err) {
      console.error("[customer-affiliate-coins] order cancel failed:", err);
    }
  };

  const cancelPayload = JSON.stringify({
    reason,
    ...(refund_payout ? { refund_payout } : {}),
  });

  try {
    const cancelStore = async () => {
      return medusaStoreFetch(`/store/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        forwardedCookie,
        headers: { Cookie: forwardedCookie },
        body: cancelPayload,
      });
    };

    let res = await cancelStore();
    if (res.ok) {
      const data = await res.json();
      await fireCustomerAffiliate();
      return NextResponse.json(data);
    }

    const text = await res.text();
    if (!text.includes("fulfillments must be canceled")) {
      return NextResponse.json({ error: text || "Unable to cancel order" }, { status: res.status });
    }

    const adminOrderRes = await adminFetch<{ order?: { fulfillments?: Array<Record<string, unknown>> } }>(
      `/admin/orders/${encodeURIComponent(orderId)}`
    );
    if (!adminOrderRes.ok || !adminOrderRes.data?.order) {
      return NextResponse.json({ error: "Unable to load order for cancellation" }, { status: 500 });
    }

    const fulfillments = adminOrderRes.data.order.fulfillments || [];
    for (const fulfillment of fulfillments) {
      const fulfillmentId = fulfillment?.id as string | undefined;
      const canceledAt = fulfillment?.canceled_at as string | undefined;
      const deliveredAt = fulfillment?.delivered_at as string | undefined;
      if (!fulfillmentId || canceledAt || deliveredAt) {
        continue;
      }
      await adminFetch(`/admin/orders/${encodeURIComponent(orderId)}/fulfillments/${encodeURIComponent(fulfillmentId)}/cancel`, {
        method: "POST",
      });
    }

    res = await cancelStore();
    if (!res.ok) {
      const retryText = await res.text();
      return NextResponse.json({ error: retryText || "Unable to cancel order" }, { status: res.status });
    }

    const data = await res.json();
    await fireCustomerAffiliate();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Unexpected error cancelling order" }, { status: 500 });
  }
}
