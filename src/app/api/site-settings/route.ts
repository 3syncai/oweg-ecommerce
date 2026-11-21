import { NextResponse } from "next/server";
import {
  getDebugControllerSettings,
  toPublicSiteSettings,
} from "@/lib/debug-controller/settings";
import { DEFAULT_DEBUG_SETTINGS } from "@/lib/debug-controller/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getDebugControllerSettings();
    const response = NextResponse.json({
      settings: toPublicSiteSettings(settings),
    });
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=300"
    );
    return response;
  } catch (error) {
    console.error("[site-settings] GET failed:", error);
    const response = NextResponse.json({
      settings: toPublicSiteSettings(DEFAULT_DEBUG_SETTINGS),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
