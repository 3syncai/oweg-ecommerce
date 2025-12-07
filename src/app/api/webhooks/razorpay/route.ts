// Bridge route so Razorpay webhooks can hit /api/webhooks/razorpay
// Mirror the route segment config from the actual handler for Turbopack compatibility.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export { POST } from "@/app/webhooks/razorpay/route";
