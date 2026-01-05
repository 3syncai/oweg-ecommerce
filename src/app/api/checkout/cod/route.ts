import { NextResponse } from "next/server";
import { convertDraftOrder, getOrderById, updateOrderMetadata } from "@/lib/medusa-admin";

export const dynamic = "force-dynamic";

type Body = {
  medusaOrderId?: string;
};

type MedusaOrder = {
  id?: string;
  metadata?: Record<string, unknown>;
  is_draft_order?: boolean;
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
    if (Array.isArray(nested) && nested[0] && typeof nested[0] === "object") {
      return nested[0] as MedusaOrder;
    }
  }
  return root as MedusaOrder;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    let medusaOrderId = body.medusaOrderId?.trim();
    if (!medusaOrderId) return badRequest("medusaOrderId is required");

    let order: MedusaOrder | null = null;

    const orderRes = await getOrderById(medusaOrderId);
    if (orderRes.ok && orderRes.data && extractOrder(orderRes.data)) {
      order = extractOrder(orderRes.data);
    } else {
      const converted = await convertDraftOrder(medusaOrderId);
      if (converted.ok) {
        const convertedOrder = extractOrder(converted.data);
        if (convertedOrder?.id) {
          medusaOrderId = convertedOrder.id;
          order = convertedOrder;
        }
      }
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const metadata = (order.metadata || {}) as Record<string, unknown>;
    const codStatus = typeof metadata.cod_status === "string" ? metadata.cod_status : undefined;

    if (codStatus === "confirmed") {
      return NextResponse.json({ ok: true, medusaOrderId, status: "confirmed" });
    }

    let finalOrderId = medusaOrderId;
    if (order.is_draft_order) {
      const converted = await convertDraftOrder(medusaOrderId);
      if (converted.ok) {
        const convertedOrder = extractOrder(converted.data) || order;
        finalOrderId = convertedOrder?.id || medusaOrderId;
      }
    }

    const razorpayStatus =
      typeof metadata.razorpay_payment_status === "string"
        ? metadata.razorpay_payment_status
        : undefined;

    await updateOrderMetadata(finalOrderId, {
      ...metadata,
      payment_method: "cod",
      cod_status: "confirmed",
      razorpay_payment_status: razorpayStatus || "cod",
    });

    return NextResponse.json({ ok: true, medusaOrderId: finalOrderId, status: "confirmed" });
  } catch (err) {
    console.error("cod confirm error", err);
    return NextResponse.json({ error: "Unable to confirm COD order" }, { status: 500 });
  }
}
