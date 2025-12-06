// Bridge route so Razorpay webhooks can hit /api/webhooks/razorpay
// Disable body parsing to preserve the exact raw payload for HMAC verification.
export const config = {
  api: {
    bodyParser: false,
  },
};

export { POST, dynamic, runtime } from "@/app/webhooks/razorpay/route";
