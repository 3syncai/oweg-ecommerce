import { NextRequest, NextResponse } from "next/server";
import {
  extractDebugAuthToken,
  verifyDebugControllerToken,
} from "@/lib/debug-controller/auth";
import { getDebugControllerSettings } from "@/lib/debug-controller/settings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = extractDebugAuthToken(req);
  if (!verifyDebugControllerToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await getDebugControllerSettings({ bypassCache: true });
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[debug-controller/settings] GET failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load debug settings. Set ENABLE_DEBUG_CONTROLLER=true and DATABASE_URL on the storefront.",
      },
      { status: 500 }
    );
  }
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

  try {
    const { updateDebugControllerSettings } = await import(
      "@/lib/debug-controller/settings"
    );
    const settings = await updateDebugControllerSettings(body);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("[debug-controller/settings] PATCH failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update debug settings. Set ENABLE_DEBUG_CONTROLLER=true on the storefront.",
      },
      { status: 500 }
    );
  }
}
