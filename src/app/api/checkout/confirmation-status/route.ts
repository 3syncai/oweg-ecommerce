import { NextResponse } from "next/server";
import { loadAuthorizedCheckoutOrder } from "@/lib/checkout-order-access";

export const dynamic = "force-dynamic";

/** No gateway polling, ledger mutation, inventory change or summary enrichment. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("orderId")?.trim();
  if (!id) return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  const access = await loadAuthorizedCheckoutOrder(req, id);
  if (access.error) return access.error;
  if (!access.loaded) return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  const { order, isDraft } = access.loaded;
  const metadata = order.metadata || {};
  return NextResponse.json({ order: {
    id: order.id, status: order.status, payment_status: order.payment_status,
    is_draft_order: isDraft,
    metadata: {
      payment_method: metadata.payment_method, cod_status: metadata.cod_status,
      razorpay_payment_status: metadata.razorpay_payment_status,
      checkout_duplicate_suppressed: metadata.checkout_duplicate_suppressed,
    },
  } }, { headers: { "Cache-Control": "private, no-store" } });
}
