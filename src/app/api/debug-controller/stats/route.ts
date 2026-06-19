import { NextRequest, NextResponse } from "next/server";
import {
  extractDebugAuthToken,
  verifyDebugControllerToken,
} from "@/lib/debug-controller/auth";
import { getDebugControllerStats } from "@/lib/debug-controller/stats";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = extractDebugAuthToken(req);
  if (!verifyDebugControllerToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getDebugControllerStats();
    const medusaUrl =
      process.env.MEDUSA_BACKEND_URL ||
      process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL ||
      "http://localhost:9000";

    let medusaOnline = false;
    try {
      const ping = await fetch(`${medusaUrl.replace(/\/$/, "")}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
      });
      medusaOnline = ping.ok;
    } catch {
      medusaOnline = false;
    }

    return NextResponse.json({
      stats,
      system: {
        nodeEnv: process.env.NODE_ENV || "unknown",
        medusaUrl,
        medusaOnline,
        databaseConfigured: Boolean(process.env.DATABASE_URL),
        opensearchConfigured: Boolean(process.env.OPENSEARCH_URL),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
