import { NextResponse } from "next/server";
import {
  getDebugControllerSettings,
  toPublicSiteSettings,
} from "@/lib/debug-controller/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getDebugControllerSettings();
  const response = NextResponse.json({ settings: toPublicSiteSettings(settings) });
  response.headers.set(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );
  return response;
}
