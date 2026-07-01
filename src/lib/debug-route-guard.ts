import { NextRequest, NextResponse } from "next/server";
import {
  extractDebugAuthToken,
  verifyDebugControllerToken,
} from "@/lib/debug-controller/auth";

/**
 * Guards legacy debug routes. Production always returns 404.
 * Non-production requires the debug-controller token.
 */
export function guardDebugRoute(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = extractDebugAuthToken(req);
  if (!verifyDebugControllerToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
