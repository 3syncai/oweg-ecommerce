import { NextRequest, NextResponse } from "next/server";
import { guardDebugRoute } from "@/lib/debug-route-guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const blocked = guardDebugRoute(req);
  if (blocked) return blocked;

  const { searchParams } = req.nextUrl;
  const orderId = searchParams.get("id");

  const apiKey = process.env.MEDUSA_ADMIN_API_KEY;
  const backendUrl = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";

  if (!apiKey) {
    return NextResponse.json(
      { error: "MEDUSA_ADMIN_API_KEY is not configured" },
      { status: 500 }
    );
  }

  if (!orderId) return NextResponse.json({ error: "No ID" });

  const basicAuth = Buffer.from(`${apiKey}:`).toString("base64");
  const authHeader = `Basic ${basicAuth}`;

  try {
    const orderRes = await fetch(`${backendUrl}/admin/orders/${orderId}`, {
      headers: { Authorization: authHeader },
    });
    const orderData = await orderRes.json();

    const item = orderData.order.items[0];
    const payload = {
      items: [{ id: item.id, quantity: item.quantity }],
      location_id: "sloc_01KA3VS3YKZWJF8KJ64GC2ZSS7",
    };

    const fulfillRes = await fetch(
      `${backendUrl}/admin/orders/${orderId}/fulfillments`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const fulfillData = await fulfillRes.json();

    return NextResponse.json({
      status: fulfillRes.status,
      error_message: fulfillData.message,
      error_type: fulfillData.type,
      full_response: fulfillData,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) });
  }
}
