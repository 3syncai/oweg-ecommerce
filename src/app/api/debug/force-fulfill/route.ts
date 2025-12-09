import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("id");

    const API_KEY = "sk_0d60738d6f5c57f469cefa3bbf79dd121bcfd44378d991eada21823abc965ab7";
    const BACKEND_URL = "http://localhost:9000";
    const basicAuth = Buffer.from(API_KEY + ":").toString('base64');
    const authHeader = `Basic ${basicAuth}`;

    if (!orderId) return NextResponse.json({ error: "No ID" });

    try {
        // 1. Fetch Order
        const orderRes = await fetch(`${BACKEND_URL}/admin/orders/${orderId}`, {
            headers: { "Authorization": authHeader }
        });
        const orderData = await orderRes.json();
        
        // 2. Try Fulfill
        const item = orderData.order.items[0]; 
        const payload = {
            items: [{ id: item.id, quantity: item.quantity }],
            location_id: "sloc_01KA3VS3YKZWJF8KJ64GC2ZSS7"
        };

        const fulfillRes = await fetch(`${BACKEND_URL}/admin/orders/${orderId}/fulfillments`, {
            method: "POST",
            headers: {
                "Authorization": authHeader,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const fulfillData = await fulfillRes.json();

        return NextResponse.json({
            status: fulfillRes.status,
            error_message: fulfillData.message, // Capture explicit message
            error_type: fulfillData.type,
            full_response: fulfillData
        });

    } catch (e) {
        return NextResponse.json({ error: String(e) });
    }
}
