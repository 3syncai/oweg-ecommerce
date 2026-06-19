import { NextRequest, NextResponse } from "next/server";
import {
  extractDebugAuthToken,
  verifyDebugControllerToken,
} from "@/lib/debug-controller/auth";
import { getDebugControllerSettings } from "@/lib/debug-controller/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getDebugControllerSettings();
  return NextResponse.json({
    settings: {
      siteStatus: settings.siteStatus,
      disableRightClick: settings.disableRightClick,
      disableTextSelect: settings.disableTextSelect,
      disableDevToolsShortcuts: settings.disableDevToolsShortcuts,
      enableCheckout: settings.enableCheckout,
      enableRegistration: settings.enableRegistration,
      enableWhatsAppWidget: settings.enableWhatsAppWidget,
      whatsappNumber: settings.whatsappNumber,
      whatsappMessage: settings.whatsappMessage,
      showAnnouncementBanner: settings.showAnnouncementBanner,
      announcementBanner: settings.announcementBanner,
      maintenanceMessage: settings.maintenanceMessage,
      maintenanceTitle: settings.maintenanceTitle,
      cacheBustVersion: settings.cacheBustVersion,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const token = extractDebugAuthToken(req);
  if (!verifyDebugControllerToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { updateDebugControllerSettings } = await import(
    "@/lib/debug-controller/settings"
  );
  const settings = await updateDebugControllerSettings(body);

  return NextResponse.json({ success: true, settings });
}
