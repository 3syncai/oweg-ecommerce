import { NextResponse } from "next/server";
import {
  getDebugControllerSettings,
  toPublicSiteSettings,
} from "@/lib/debug-controller/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getDebugControllerSettings();
  return NextResponse.json({ settings: toPublicSiteSettings(settings) });
}
