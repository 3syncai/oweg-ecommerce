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
    const settings = await getDebugControllerSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[debug-controller/settings] GET failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
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
    const message = error instanceof Error ? error.message : "Failed to update settings";
    const status = message.includes("DATABASE_URL is not configured") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
