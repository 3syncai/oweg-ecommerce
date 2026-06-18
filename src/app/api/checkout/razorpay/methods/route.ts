import { NextResponse } from "next/server";
import { fetchRazorpayMethods } from "@/lib/razorpay";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const methods = await fetchRazorpayMethods();
    return NextResponse.json({ methods });
  } catch (err) {
    console.error("razorpay methods fetch failed", err);
    const message = err instanceof Error ? err.message : "Unable to load payment methods";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
