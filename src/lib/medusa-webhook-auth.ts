import { NextRequest, NextResponse } from "next/server";

export function verifyMedusaWebhookSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.MEDUSA_WEBHOOK_SECRET?.trim();
  const provided = req.headers.get("x-webhook-secret")?.trim();

  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      return NextResponse.json(
        { error: "Webhook secret not configured" },
        { status: 503 }
      );
    }
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
  }

  if (secret && provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
