import { NextResponse } from "next/server";
import {
  getDebugControllerSettings,
  toPublicSiteSettings,
} from "@/lib/debug-controller/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getDebugControllerSettings();
    return NextResponse.json({ settings: toPublicSiteSettings(settings) });
  } catch (error) {
    console.error("[site-settings] GET failed:", error);
    const { DEFAULT_DEBUG_SETTINGS } = await import("@/lib/debug-controller/types");
    return NextResponse.json({ settings: toPublicSiteSettings(DEFAULT_DEBUG_SETTINGS) });
  }
}
