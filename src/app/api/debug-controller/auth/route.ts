import { NextRequest, NextResponse } from "next/server";
import {
  extractDebugAuthToken,
  verifyDebugControllerToken,
} from "@/lib/debug-controller/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { token?: string } | null;
    const token = body?.token?.trim();

    if (!verifyDebugControllerToken(token)) {
      return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[debug-controller/auth] configuration error:", error);
    return NextResponse.json(
      {
        error:
          "Debug controller secret is not configured correctly on this server. Set DEBUG_CONTROLLER_SECRET in production.",
      },
      { status: 503 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const token = extractDebugAuthToken(req);
    if (!verifyDebugControllerToken(token)) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    return NextResponse.json({ authenticated: true });
  } catch (error) {
    console.error("[debug-controller/auth] configuration error:", error);
    return NextResponse.json({ authenticated: false }, { status: 503 });
  }
}
