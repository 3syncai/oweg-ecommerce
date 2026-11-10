import { NextResponse } from "next/server";
import {
  getDebugControllerSettings,
  toPublicSiteSettings,
} from "@/lib/debug-controller/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getDebugControllerSettings().catch(() => null);
  if (!settings) {
    return NextResponse.json(
      { error: "Site settings temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "3" } }
    );
  }
  const response = NextResponse.json({ settings: toPublicSiteSettings(settings) });
  response.headers.set(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );
  return response;
}
