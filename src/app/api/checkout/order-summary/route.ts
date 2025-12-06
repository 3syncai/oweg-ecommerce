import { NextResponse } from "next/server";
import { getOrderById } from "@/lib/medusa-admin";

export const dynamic = "force-dynamic";

type MedusaOrder = {
  id?: string;
  display_id?: number | string;
  status?: string;
  payment_status?: string;
  fulfillment_status?: string;
  is_draft_order?: boolean;
  email?: string;
  currency_code?: string;
  total?: number;
  subtotal?: number;
  tax_total?: number;
  shipping_total?: number;
  items?: Array<Record<string, unknown>>;
  shipping_address?: Record<string, unknown>;
  billing_address?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

function extractOrder(data: unknown): MedusaOrder | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const direct = root.order;
  if (direct && typeof direct === "object") return direct as MedusaOrder;
  const nested = root.data;
  if (nested && typeof nested === "object") {
    const nestedOrder = (nested as Record<string, unknown>).order;
    if (nestedOrder && typeof nestedOrder === "object") return nestedOrder as MedusaOrder;
  }
  return root as MedusaOrder;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId") || url.searchParams.get("id");
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const orderRes = await getOrderById(orderId);
  const order = orderRes.data ? extractOrder(orderRes.data) : null;
  if (!orderRes.ok || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const metadata = (order.metadata || {}) as Record<string, unknown>;

  const items = Array.isArray(order.items)
    ? order.items.map((item: unknown) => {
        const record = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
        return {
          id: record.id as string | number | undefined,
          title: (record.title as string) || (record.product_title as string),
          quantity: record.quantity as number,
          unit_price: record.unit_price as number,
          total: record.total as number,
          thumbnail: (record.thumbnail as string) || (record.image_url as string),
        };
      })
    : [];

  const razorpayStatus =
    typeof metadata.razorpay_payment_status === "string" ? metadata.razorpay_payment_status : undefined;
  const payment_status =
    razorpayStatus === "captured" ? "paid" : (order.payment_status as string | undefined);

  const paid_total =
    typeof metadata.medusa_total_minor === "number"
      ? metadata.medusa_total_minor
      : (order.total as number | undefined);

  return NextResponse.json({
    order: {
      id: order.id,
      display_id: order.display_id,
      status: order.status,
      payment_status,
      fulfillment_status: order.fulfillment_status,
      is_draft_order: order.is_draft_order,
      email: order.email,
      currency_code: order.currency_code,
      total: order.total,
      paid_total,
      subtotal: order.subtotal,
      tax_total: order.tax_total,
      shipping_total: order.shipping_total,
      items,
      shipping_address: order.shipping_address,
      billing_address: order.billing_address,
      metadata,
    },
  });
}
